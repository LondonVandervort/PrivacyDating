// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint8, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";

contract PrivacyDating {

    address public owner;
    uint32 public nextUserId;
    uint32 public nextMatchId;

    struct PrivateProfile {
        euint8 age;
        euint8 location;
        euint8 interests;
        euint8 preference;
        bool isActive;
        bool isVisible;
        uint256 joinedAt;
    }

    struct PublicProfile {
        string nickname;
        string bio;
        bool isActive;
        uint256 joinedAt;
        uint32 totalMatches;
    }

    struct MatchRequest {
        uint32 requesterUserId;
        uint32 targetUserId;
        euint8 compatibilityScore;
        bool isAccepted;
        bool isRejected;
        uint256 requestTime;
    }

    struct CompatibilityResult {
        uint32 userId1;
        uint32 userId2;
        uint8 publicScore;
        bool isRevealed;
        uint256 matchTime;
    }

    mapping(address => uint32) public addressToUserId;
    mapping(uint32 => address) public userIdToAddress;
    mapping(uint32 => PrivateProfile) private userProfiles;
    mapping(uint32 => PublicProfile) public publicProfiles;
    mapping(uint32 => MatchRequest) public matchRequests;
    mapping(uint32 => CompatibilityResult) public compatibilityResults;
    mapping(uint32 => uint32[]) public userMatches;

    event UserRegistered(uint32 indexed userId, address indexed userAddress, string nickname);
    event MatchRequested(uint32 indexed matchId, uint32 indexed requester, uint32 indexed target);
    event MatchAccepted(uint32 indexed matchId, uint32 indexed userId1, uint32 indexed userId2);
    event CompatibilityRevealed(uint32 indexed matchId, uint32 indexed userId1, uint32 indexed userId2, uint8 score);
    event ProfileUpdated(uint32 indexed userId);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    modifier onlyRegisteredUser() {
        require(addressToUserId[msg.sender] != 0, "User not registered");
        _;
    }

    modifier onlyActiveUser() {
        uint32 userId = addressToUserId[msg.sender];
        require(userId != 0 && publicProfiles[userId].isActive, "User not active");
        _;
    }

    constructor() {
        owner = msg.sender;
        nextUserId = 1;
        nextMatchId = 1;
    }

    function registerUser(
        string calldata _nickname,
        string calldata _bio,
        uint8 _age,
        uint8 _location,
        uint8 _interests,
        uint8 _preference
    ) external {
        require(addressToUserId[msg.sender] == 0, "User already registered");
        require(bytes(_nickname).length > 0, "Nickname required");
        require(_age >= 18 && _age <= 100, "Invalid age");

        uint32 userId = nextUserId++;

        euint8 encryptedAge = FHE.asEuint8(_age);
        euint8 encryptedLocation = FHE.asEuint8(_location);
        euint8 encryptedInterests = FHE.asEuint8(_interests);
        euint8 encryptedPreference = FHE.asEuint8(_preference);

        userProfiles[userId] = PrivateProfile({
            age: encryptedAge,
            location: encryptedLocation,
            interests: encryptedInterests,
            preference: encryptedPreference,
            isActive: true,
            isVisible: true,
            joinedAt: block.timestamp
        });

        publicProfiles[userId] = PublicProfile({
            nickname: _nickname,
            bio: _bio,
            isActive: true,
            joinedAt: block.timestamp,
            totalMatches: 0
        });

        addressToUserId[msg.sender] = userId;
        userIdToAddress[userId] = msg.sender;

        FHE.allowThis(encryptedAge);
        FHE.allowThis(encryptedLocation);
        FHE.allowThis(encryptedInterests);
        FHE.allowThis(encryptedPreference);

        FHE.allow(encryptedAge, msg.sender);
        FHE.allow(encryptedLocation, msg.sender);
        FHE.allow(encryptedInterests, msg.sender);
        FHE.allow(encryptedPreference, msg.sender);

        emit UserRegistered(userId, msg.sender, _nickname);
    }

    function updateProfile(
        string calldata _nickname,
        string calldata _bio,
        bool _isVisible
    ) external onlyActiveUser {
        uint32 userId = addressToUserId[msg.sender];

        publicProfiles[userId].nickname = _nickname;
        publicProfiles[userId].bio = _bio;
        userProfiles[userId].isVisible = _isVisible;

        emit ProfileUpdated(userId);
    }

    function requestMatch(uint32 _targetUserId) external onlyActiveUser {
        uint32 requesterId = addressToUserId[msg.sender];
        require(_targetUserId != requesterId, "Cannot match with yourself");
        require(publicProfiles[_targetUserId].isActive, "Target user not active");
        require(userProfiles[_targetUserId].isVisible, "Target user not visible");

        euint8 compatibilityScore = calculateCompatibility(requesterId, _targetUserId);

        uint32 matchId = nextMatchId++;

        matchRequests[matchId] = MatchRequest({
            requesterUserId: requesterId,
            targetUserId: _targetUserId,
            compatibilityScore: compatibilityScore,
            isAccepted: false,
            isRejected: false,
            requestTime: block.timestamp
        });

        FHE.allowThis(compatibilityScore);
        FHE.allow(compatibilityScore, msg.sender);
        FHE.allow(compatibilityScore, userIdToAddress[_targetUserId]);

        emit MatchRequested(matchId, requesterId, _targetUserId);
    }

    function acceptMatch(uint32 _matchId) external onlyActiveUser {
        require(matchRequests[_matchId].targetUserId == addressToUserId[msg.sender], "Not your match request");
        require(!matchRequests[_matchId].isAccepted && !matchRequests[_matchId].isRejected, "Already processed");

        matchRequests[_matchId].isAccepted = true;

        uint32 userId1 = matchRequests[_matchId].requesterUserId;
        uint32 userId2 = matchRequests[_matchId].targetUserId;

        userMatches[userId1].push(_matchId);
        userMatches[userId2].push(_matchId);

        publicProfiles[userId1].totalMatches++;
        publicProfiles[userId2].totalMatches++;

        compatibilityResults[_matchId] = CompatibilityResult({
            userId1: userId1,
            userId2: userId2,
            publicScore: 0,
            isRevealed: false,
            matchTime: block.timestamp
        });

        emit MatchAccepted(_matchId, userId1, userId2);

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(matchRequests[_matchId].compatibilityScore);
        FHE.requestDecryption(cts, this.processCompatibilityReveal.selector, uint256(_matchId));
    }

    function rejectMatch(uint32 _matchId) external onlyActiveUser {
        require(matchRequests[_matchId].targetUserId == addressToUserId[msg.sender], "Not your match request");
        require(!matchRequests[_matchId].isAccepted && !matchRequests[_matchId].isRejected, "Already processed");

        matchRequests[_matchId].isRejected = true;
    }

    function processCompatibilityReveal(
        uint256 requestId,
        bytes memory decryptedResult,
        bytes memory decryptionProof
    ) external {
        FHE.checkSignatures(requestId, decryptedResult, decryptionProof);

        uint8 score = abi.decode(decryptedResult, (uint8));

        uint32 matchId = uint32(requestId);

        compatibilityResults[matchId].publicScore = score;
        compatibilityResults[matchId].isRevealed = true;

        emit CompatibilityRevealed(
            matchId,
            compatibilityResults[matchId].userId1,
            compatibilityResults[matchId].userId2,
            score
        );
    }

    function calculateCompatibility(uint32 _userId1, uint32 _userId2) private returns (euint8) {
        PrivateProfile storage profile1 = userProfiles[_userId1];
        PrivateProfile storage profile2 = userProfiles[_userId2];

        euint8 ageDiff = FHE.sub(profile1.age, profile2.age);
        ageDiff = FHE.select(FHE.lt(ageDiff, FHE.asEuint8(0)), FHE.sub(profile2.age, profile1.age), ageDiff);

        euint8 locationMatch = FHE.select(FHE.eq(profile1.location, profile2.location), FHE.asEuint8(30), FHE.asEuint8(0));

        euint8 interestMatch = FHE.select(FHE.eq(profile1.interests, profile2.interests), FHE.asEuint8(40), FHE.asEuint8(0));

        euint8 preferenceMatch = FHE.select(FHE.eq(profile1.preference, profile2.preference), FHE.asEuint8(30), FHE.asEuint8(0));

        euint8 ageScore = FHE.select(FHE.le(ageDiff, FHE.asEuint8(5)), FHE.asEuint8(20),
                         FHE.select(FHE.le(ageDiff, FHE.asEuint8(10)), FHE.asEuint8(10), FHE.asEuint8(0)));

        euint8 totalScore = FHE.add(FHE.add(locationMatch, interestMatch), FHE.add(preferenceMatch, ageScore));

        return FHE.select(FHE.gt(totalScore, FHE.asEuint8(100)), FHE.asEuint8(100), totalScore);
    }

    function getUserProfile(uint32 _userId) external view returns (
        string memory nickname,
        string memory bio,
        bool isActive,
        uint256 joinedAt,
        uint32 totalMatches
    ) {
        PublicProfile storage profile = publicProfiles[_userId];
        return (
            profile.nickname,
            profile.bio,
            profile.isActive,
            profile.joinedAt,
            profile.totalMatches
        );
    }

    function getMyUserId() external view returns (uint32) {
        return addressToUserId[msg.sender];
    }

    function getMyMatches() external view onlyRegisteredUser returns (uint32[] memory) {
        uint32 userId = addressToUserId[msg.sender];
        return userMatches[userId];
    }

    function getMatchDetails(uint32 _matchId) external view returns (
        uint32 userId1,
        uint32 userId2,
        bool isAccepted,
        bool isRejected,
        bool isRevealed,
        uint8 publicScore,
        uint256 requestTime,
        uint256 matchTime
    ) {
        MatchRequest storage request = matchRequests[_matchId];
        CompatibilityResult storage result = compatibilityResults[_matchId];

        return (
            request.requesterUserId,
            request.targetUserId,
            request.isAccepted,
            request.isRejected,
            result.isRevealed,
            result.publicScore,
            request.requestTime,
            result.matchTime
        );
    }

    function deactivateProfile() external onlyActiveUser {
        uint32 userId = addressToUserId[msg.sender];
        publicProfiles[userId].isActive = false;
        userProfiles[userId].isActive = false;
    }

    function reactivateProfile() external onlyRegisteredUser {
        uint32 userId = addressToUserId[msg.sender];
        publicProfiles[userId].isActive = true;
        userProfiles[userId].isActive = true;
    }

    function setVisibility(bool _isVisible) external onlyActiveUser {
        uint32 userId = addressToUserId[msg.sender];
        userProfiles[userId].isVisible = _isVisible;
    }

    function getTotalUsers() external view returns (uint32) {
        return nextUserId - 1;
    }

    function getTotalMatches() external view returns (uint32) {
        return nextMatchId - 1;
    }
}
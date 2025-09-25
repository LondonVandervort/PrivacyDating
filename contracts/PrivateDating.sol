// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint8, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract PrivateDating is SepoliaConfig {

    address public owner;
    uint256 public userCount;
    uint256 public matchCount;

    // 用户资料结构
    struct UserProfile {
        bool isActive;
        euint8 encryptedAge;           // 加密年龄
        euint8 encryptedLocation;      // 加密位置代码
        euint8 encryptedInterests;     // 加密兴趣代码
        euint8 encryptedPersonality;   // 加密性格类型
        string publicBio;              // 公开简介
        uint256 registrationTime;
        bool isLookingForMatch;
    }

    // 匹配请求结构
    struct MatchRequest {
        address requester;
        address target;
        euint8 compatibilityScore;     // 加密兼容性评分
        bool isProcessed;
        bool isMutual;
        uint256 timestamp;
        string encryptedMessage;       // 加密私信
    }

    // 聊天室结构
    struct ChatRoom {
        address user1;
        address user2;
        bool isActive;
        uint256 creationTime;
        string[] messages;
        address[] messageSenders;
    }

    mapping(address => UserProfile) public profiles;
    mapping(uint256 => MatchRequest) public matchRequests;
    mapping(bytes32 => ChatRoom) public chatRooms;
    mapping(address => uint256[]) public userMatches;
    mapping(address => bytes32[]) public userChats;

    // 年龄、位置偏好设置
    mapping(address => euint8) public preferredMinAge;
    mapping(address => euint8) public preferredMaxAge;
    mapping(address => euint8) public preferredLocation;

    event UserRegistered(address indexed user, uint256 timestamp);
    event MatchRequested(address indexed requester, address indexed target, uint256 matchId);
    event MutualMatchFound(address indexed user1, address indexed user2, bytes32 chatRoomId);
    event ChatRoomCreated(bytes32 indexed chatRoomId, address indexed user1, address indexed user2);
    event MessageSent(bytes32 indexed chatRoomId, address indexed sender);
    event ProfileUpdated(address indexed user);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    modifier onlyActiveUser() {
        require(profiles[msg.sender].isActive, "User not active");
        _;
    }

    modifier onlyRegisteredUser() {
        require(profiles[msg.sender].registrationTime > 0, "User not registered");
        _;
    }

    constructor() {
        owner = msg.sender;
        userCount = 0;
        matchCount = 0;
    }

    // 用户注册
    function registerUser(
        uint8 _age,
        uint8 _location,
        uint8 _interests,
        uint8 _personality,
        string memory _publicBio
    ) external {
        require(!profiles[msg.sender].isActive, "User already registered");
        require(_age >= 18 && _age <= 100, "Age must be between 18-100");
        require(bytes(_publicBio).length <= 500, "Bio too long");

        // 加密用户数据
        euint8 encryptedAge = FHE.asEuint8(_age);
        euint8 encryptedLocation = FHE.asEuint8(_location);
        euint8 encryptedInterests = FHE.asEuint8(_interests);
        euint8 encryptedPersonality = FHE.asEuint8(_personality);

        profiles[msg.sender] = UserProfile({
            isActive: true,
            encryptedAge: encryptedAge,
            encryptedLocation: encryptedLocation,
            encryptedInterests: encryptedInterests,
            encryptedPersonality: encryptedPersonality,
            publicBio: _publicBio,
            registrationTime: block.timestamp,
            isLookingForMatch: true
        });

        // 设置ACL权限
        FHE.allowThis(encryptedAge);
        FHE.allowThis(encryptedLocation);
        FHE.allowThis(encryptedInterests);
        FHE.allowThis(encryptedPersonality);

        FHE.allow(encryptedAge, msg.sender);
        FHE.allow(encryptedLocation, msg.sender);
        FHE.allow(encryptedInterests, msg.sender);
        FHE.allow(encryptedPersonality, msg.sender);

        userCount++;
        emit UserRegistered(msg.sender, block.timestamp);
    }

    // 设置匹配偏好
    function setMatchingPreferences(
        uint8 _minAge,
        uint8 _maxAge,
        uint8 _preferredLocation
    ) external onlyRegisteredUser {
        require(_minAge >= 18 && _maxAge <= 100 && _minAge <= _maxAge, "Invalid age range");

        preferredMinAge[msg.sender] = FHE.asEuint8(_minAge);
        preferredMaxAge[msg.sender] = FHE.asEuint8(_maxAge);
        preferredLocation[msg.sender] = FHE.asEuint8(_preferredLocation);

        FHE.allowThis(preferredMinAge[msg.sender]);
        FHE.allowThis(preferredMaxAge[msg.sender]);
        FHE.allowThis(preferredLocation[msg.sender]);

        emit ProfileUpdated(msg.sender);
    }

    // 发送匹配请求（加密兼容性计算）
    function sendMatchRequest(
        address _target,
        string memory _encryptedMessage
    ) external onlyActiveUser {
        require(profiles[_target].isActive, "Target user not active");
        require(profiles[_target].isLookingForMatch, "Target not looking for matches");
        require(_target != msg.sender, "Cannot match with yourself");

        // 计算加密兼容性评分
        euint8 compatibilityScore = calculateCompatibility(msg.sender, _target);

        uint256 matchId = matchCount++;
        matchRequests[matchId] = MatchRequest({
            requester: msg.sender,
            target: _target,
            compatibilityScore: compatibilityScore,
            isProcessed: false,
            isMutual: false,
            timestamp: block.timestamp,
            encryptedMessage: _encryptedMessage
        });

        userMatches[msg.sender].push(matchId);

        FHE.allowThis(compatibilityScore);
        FHE.allow(compatibilityScore, msg.sender);
        FHE.allow(compatibilityScore, _target);

        emit MatchRequested(msg.sender, _target, matchId);

        // 检查是否为相互匹配
        checkMutualMatch(msg.sender, _target);
    }

    // 计算兼容性评分（私密计算）
    function calculateCompatibility(address _user1, address _user2) private returns (euint8) {
        UserProfile storage profile1 = profiles[_user1];
        UserProfile storage profile2 = profiles[_user2];

        // 年龄兼容性
        ebool ageMatch = FHE.le(
            FHE.sub(profile1.encryptedAge, profile2.encryptedAge),
            FHE.asEuint8(5)
        );

        // 位置兼容性
        ebool locationMatch = FHE.eq(profile1.encryptedLocation, profile2.encryptedLocation);

        // 兴趣兼容性
        ebool interestMatch = FHE.eq(profile1.encryptedInterests, profile2.encryptedInterests);

        // 计算总分（简化版）
        euint8 score = FHE.select(ageMatch, FHE.asEuint8(30), FHE.asEuint8(0));
        score = FHE.add(score, FHE.select(locationMatch, FHE.asEuint8(40), FHE.asEuint8(0)));
        score = FHE.add(score, FHE.select(interestMatch, FHE.asEuint8(30), FHE.asEuint8(0)));

        return score;
    }

    // 检查相互匹配
    function checkMutualMatch(address _user1, address _user2) private {
        bool foundMutual = false;
        uint256 mutualMatchId = 0;

        // 检查是否存在反向匹配请求
        for (uint256 i = 0; i < userMatches[_user2].length; i++) {
            uint256 matchId = userMatches[_user2][i];
            MatchRequest storage request = matchRequests[matchId];

            if (request.target == _user1 && !request.isProcessed) {
                foundMutual = true;
                mutualMatchId = matchId;
                break;
            }
        }

        if (foundMutual) {
            // 创建聊天室
            bytes32 chatRoomId = keccak256(abi.encodePacked(_user1, _user2, block.timestamp));
            createChatRoom(chatRoomId, _user1, _user2);

            // 标记匹配为相互的
            matchRequests[mutualMatchId].isMutual = true;
            matchRequests[mutualMatchId].isProcessed = true;

            emit MutualMatchFound(_user1, _user2, chatRoomId);
        }
    }

    // 创建聊天室
    function createChatRoom(bytes32 _chatRoomId, address _user1, address _user2) private {
        chatRooms[_chatRoomId] = ChatRoom({
            user1: _user1,
            user2: _user2,
            isActive: true,
            creationTime: block.timestamp,
            messages: new string[](0),
            messageSenders: new address[](0)
        });

        userChats[_user1].push(_chatRoomId);
        userChats[_user2].push(_chatRoomId);

        emit ChatRoomCreated(_chatRoomId, _user1, _user2);
    }

    // 发送聊天消息
    function sendMessage(bytes32 _chatRoomId, string memory _encryptedMessage) external {
        ChatRoom storage room = chatRooms[_chatRoomId];
        require(room.isActive, "Chat room not active");
        require(
            msg.sender == room.user1 || msg.sender == room.user2,
            "Not authorized for this chat"
        );
        require(bytes(_encryptedMessage).length <= 1000, "Message too long");

        room.messages.push(_encryptedMessage);
        room.messageSenders.push(msg.sender);

        emit MessageSent(_chatRoomId, msg.sender);
    }

    // 获取用户资料（公开信息）
    function getUserProfile(address _user) external view returns (
        bool isActive,
        string memory publicBio,
        uint256 registrationTime,
        bool isLookingForMatch
    ) {
        UserProfile storage profile = profiles[_user];
        return (
            profile.isActive,
            profile.publicBio,
            profile.registrationTime,
            profile.isLookingForMatch
        );
    }

    // 获取用户匹配列表
    function getUserMatches(address _user) external view returns (uint256[] memory) {
        return userMatches[_user];
    }

    // 获取用户聊天室列表
    function getUserChats(address _user) external view returns (bytes32[] memory) {
        return userChats[_user];
    }

    // 获取聊天室信息
    function getChatRoomInfo(bytes32 _chatRoomId) external view returns (
        address user1,
        address user2,
        bool isActive,
        uint256 creationTime,
        uint256 messageCount
    ) {
        ChatRoom storage room = chatRooms[_chatRoomId];
        require(
            msg.sender == room.user1 || msg.sender == room.user2 || msg.sender == owner,
            "Not authorized to view this chat"
        );

        return (
            room.user1,
            room.user2,
            room.isActive,
            room.creationTime,
            room.messages.length
        );
    }

    // 获取聊天记录
    function getChatMessages(bytes32 _chatRoomId, uint256 _offset, uint256 _limit)
        external view returns (string[] memory messages, address[] memory senders) {
        ChatRoom storage room = chatRooms[_chatRoomId];
        require(
            msg.sender == room.user1 || msg.sender == room.user2,
            "Not authorized to view messages"
        );

        uint256 totalMessages = room.messages.length;
        if (_offset >= totalMessages) {
            return (new string[](0), new address[](0));
        }

        uint256 end = _offset + _limit;
        if (end > totalMessages) {
            end = totalMessages;
        }

        uint256 resultLength = end - _offset;
        messages = new string[](resultLength);
        senders = new address[](resultLength);

        for (uint256 i = 0; i < resultLength; i++) {
            messages[i] = room.messages[_offset + i];
            senders[i] = room.messageSenders[_offset + i];
        }

        return (messages, senders);
    }

    // 更新用户状态
    function updateLookingForMatch(bool _isLooking) external onlyRegisteredUser {
        profiles[msg.sender].isLookingForMatch = _isLooking;
        emit ProfileUpdated(msg.sender);
    }

    // 更新公开简介
    function updatePublicBio(string memory _newBio) external onlyRegisteredUser {
        require(bytes(_newBio).length <= 500, "Bio too long");
        profiles[msg.sender].publicBio = _newBio;
        emit ProfileUpdated(msg.sender);
    }

    // 获取平台统计
    function getPlatformStats() external view returns (
        uint256 totalUsers,
        uint256 totalMatches,
        uint256 activeUsers
    ) {
        // 简化版统计，实际应用中需要更复杂的计算
        return (userCount, matchCount, userCount);
    }

    // 紧急停用账户
    function deactivateAccount() external onlyRegisteredUser {
        profiles[msg.sender].isActive = false;
        profiles[msg.sender].isLookingForMatch = false;
        emit ProfileUpdated(msg.sender);
    }

    // 管理员功能：停用用户
    function adminDeactivateUser(address _user) external onlyOwner {
        profiles[_user].isActive = false;
        profiles[_user].isLookingForMatch = false;
        emit ProfileUpdated(_user);
    }
}
// Privacy Dating Platform - Main Application
class PrivacyDatingApp {
    constructor() {
        this.CONTRACT_ADDRESS = "0x5C4E7FAeb2cD429cD858eF8C5D19A45bF3cC9A1c";
        // Disable force test mode to check real contract
        this.FORCE_TEST_MODE = false;
        this.CONTRACT_ABI = [
            "function registerUser(string calldata _nickname, string calldata _bio, uint8 _age, uint8 _location, uint8 _interests, uint8 _preference) external",
            "function getMyUserId() external view returns (uint32)",
            "function getUserProfile(uint32 _userId) external view returns (string memory nickname, string memory bio, bool isActive, uint256 joinedAt, uint32 totalMatches)",
            "function requestMatch(uint32 _targetUserId) external",
            "function acceptMatch(uint32 _matchId) external",
            "function rejectMatch(uint32 _matchId) external",
            "function getMyMatches() external view returns (uint32[] memory)",
            "function getMatchDetails(uint32 _matchId) external view returns (uint32 userId1, uint32 userId2, bool isAccepted, bool isRejected, bool isRevealed, uint8 publicScore, uint256 requestTime, uint256 matchTime)",
            "function setVisibility(bool _isVisible) external",
            "function deactivateProfile() external",
            "function reactivateProfile() external",
            "function getTotalUsers() external view returns (uint32)",
            "function getTotalMatches() external view returns (uint32)",
            "event UserRegistered(uint32 indexed userId, address indexed userAddress, string nickname)",
            "event MatchRequested(uint32 indexed matchId, uint32 indexed requester, uint32 indexed target)",
            "event MatchAccepted(uint32 indexed matchId, uint32 indexed userId1, uint32 indexed userId2)",
            "event CompatibilityRevealed(uint32 indexed matchId, uint32 indexed userId1, uint32 indexed userId2, uint8 score)"
        ];

        this.provider = null;
        this.signer = null;
        this.contract = null;
        this.userAccount = null;
        this.userId = null;
        this.isLoading = false;
        this.isTestMode = false;

        this.init();
    }

    // Helper function to get gas options for transactions
    async getGasOptions(gasLimit = 300000) {
        const gasPrice = await this.provider.getGasPrice();
        return {
            gasLimit: gasLimit,
            gasPrice: gasPrice
        };
    }

    async init() {
        // Check if ethers is loaded
        if (typeof ethers === 'undefined') {
            this.showNotification('Loading blockchain library...', 'info');
            // Wait a bit for fallback script to load
            await new Promise(resolve => setTimeout(resolve, 2000));

            if (typeof ethers === 'undefined') {
                this.showNotification('Failed to load blockchain library. Please refresh the page.', 'error');
                return;
            }
        }

        if (typeof window.ethereum !== 'undefined') {
            try {
                this.provider = new ethers.providers.Web3Provider(window.ethereum);
                this.setupEventListeners();
                await this.checkConnection();
            } catch (error) {
                console.error('Error initializing provider:', error);
                this.showNotification('Failed to initialize wallet connection. Please refresh the page.', 'error');
            }
        } else {
            this.showNotification('Please install MetaMask to use this application', 'error');
        }
    }

    setupEventListeners() {
        // Wallet connection
        document.getElementById('connectWallet').addEventListener('click', () => this.connectWallet());

        // Registration
        document.getElementById('registrationForm').addEventListener('submit', (e) => this.handleRegistration(e));

        // Dashboard actions
        document.getElementById('requestMatch').addEventListener('click', () => this.requestMatch());
        document.getElementById('updateVisibility').addEventListener('click', () => this.updateVisibility());
        document.getElementById('deactivateProfile').addEventListener('click', () => this.deactivateProfile());
        document.getElementById('reactivateProfile').addEventListener('click', () => this.reactivateProfile());

        // Auto-refresh matches every 30 seconds
        setInterval(() => {
            if (this.userId && Number(this.userId) > 0 && !this.isTestMode) {
                this.loadMatches();
                this.loadPendingRequests();
            }
        }, 30000);

        // Account change listener
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length === 0) {
                    this.handleDisconnection();
                } else {
                    this.handleAccountChange(accounts[0]);
                }
            });

            window.ethereum.on('chainChanged', () => {
                window.location.reload();
            });
        }
    }

    async checkConnection() {
        try {
            const accounts = await this.provider.listAccounts();
            if (accounts.length > 0) {
                this.userAccount = accounts[0];
                await this.initializeContract();
                await this.updateWalletUI(true);
                await this.loadUserData();
            }
        } catch (error) {
            console.error('Error checking connection:', error);
        }
    }

    async connectWallet() {
        try {
            this.showLoading('Connecting wallet...');
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            this.signer = this.provider.getSigner();
            this.userAccount = await this.signer.getAddress();

            console.log('Wallet connected successfully');
            console.log('User account:', this.userAccount);

            await this.initializeContract();
            await this.updateWalletUI(true);
            await this.loadUserData();

            this.hideLoading();
            this.showNotification('Wallet connected successfully!', 'success');
        } catch (error) {
            this.hideLoading();
            console.error('Error connecting wallet:', error);
            this.showNotification('Failed to connect wallet', 'error');
        }
    }

    async initializeContract() {
        this.signer = this.provider.getSigner();
        this.contract = new ethers.Contract(this.CONTRACT_ADDRESS, this.CONTRACT_ABI, this.signer);

        // Check network
        const network = await this.provider.getNetwork();
        console.log('Connected to network:', network);
        this.updateNetworkInfo(network);

        // Check if we should force test mode
        if (this.FORCE_TEST_MODE) {
            console.log('Force test mode enabled');
            this.isTestMode = true;
            this.showNotification(`Running in test mode - Contract functionality simulated`, 'info');
            return;
        }

        // Verify contract exists
        try {
            console.log('Checking contract at address:', this.CONTRACT_ADDRESS);
            const code = await this.provider.getCode(this.CONTRACT_ADDRESS);
            console.log('Contract code:', code);
            console.log('Contract code length:', code.length);

            if (code === '0x' || code.length <= 2) {
                console.warn('No contract found at address:', this.CONTRACT_ADDRESS);
                this.isTestMode = true;
                this.showNotification(`Contract not deployed at ${this.CONTRACT_ADDRESS}. Running in test mode.`, 'info');
            } else {
                console.log('Contract bytecode found at address:', this.CONTRACT_ADDRESS);
                console.log('Attempting to call contract functions...');

                // Test basic contract call with more detailed error handling
                try {
                    console.log('Testing getTotalUsers() function...');
                    const totalUsers = await this.contract.getTotalUsers();
                    console.log('✅ Contract test successful! Total users:', totalUsers.toString());
                    this.isTestMode = false;
                    this.showNotification(`Connected to deployed contract! Total users: ${totalUsers}`, 'success');
                } catch (testError) {
                    console.error('❌ Contract function call failed:', testError);
                    console.error('Error name:', testError.name);
                    console.error('Error message:', testError.message);

                    // Try to determine the specific error
                    if (testError.message.includes('revert')) {
                        console.log('Contract reverted - may be incompatible ABI');
                        this.showNotification(`Contract found but ABI mismatch. Check contract version.`, 'error');
                    } else if (testError.message.includes('network')) {
                        console.log('Network error calling contract');
                        this.showNotification(`Network error calling contract. Check connection.`, 'error');
                    } else {
                        console.log('Unknown contract error');
                        this.showNotification(`Contract exists but call failed: ${testError.message}`, 'error');
                    }

                    this.isTestMode = true;
                }
            }
        } catch (error) {
            console.error('❌ Error checking contract:', error);
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                code: error.code
            });
            this.isTestMode = true;
            this.showNotification(`Contract check failed: ${error.message}`, 'error');
        }
    }

    async updateWalletUI(connected) {
        const connectButton = document.getElementById('connectWallet');
        const walletInfo = document.getElementById('walletInfo');
        const walletAddress = document.getElementById('walletAddress');

        if (connected) {
            connectButton.classList.add('hidden');
            walletInfo.classList.remove('hidden');
            walletAddress.textContent = `${this.userAccount.substring(0, 6)}...${this.userAccount.substring(38)}`;
        } else {
            connectButton.classList.remove('hidden');
            walletInfo.classList.add('hidden');
        }
    }

    updateNetworkInfo(network) {
        const networkInfo = document.getElementById('networkInfo');
        const networkName = document.getElementById('networkName');

        let displayName = network.name;
        if (network.chainId === 11155111) displayName = 'Sepolia Testnet';
        if (network.chainId === 1) displayName = 'Ethereum Mainnet';

        networkName.textContent = displayName;
        networkInfo.classList.remove('hidden');
    }

    async loadUserData() {
        try {
            console.log('Loading user data...');
            console.log('Contract:', this.contract);
            console.log('User account:', this.userAccount);
            console.log('Test mode:', this.isTestMode);

            // Always show registration form first
            console.log('Showing registration form');
            this.showRegistrationForm();

            // Always show stats section
            console.log('Showing stats section');
            document.getElementById('statsSection').classList.remove('hidden');

            if (this.isTestMode) {
                console.log('Test mode: loading test data');
                this.loadTestStats();
                return;
            }

            // Try to test contract connection
            try {
                const totalUsers = await this.contract.getTotalUsers();
                console.log('Contract connection test - Total users:', totalUsers.toString());

                this.userId = await this.contract.getMyUserId();
                console.log('User ID:', this.userId.toString());

                if (Number(this.userId) > 0) {
                    console.log('User registered, loading dashboard');
                    await this.loadUserProfile();
                    await this.loadMatches();
                    await this.loadPendingRequests();
                    await this.loadPlatformStats();
                    this.showDashboard();
                } else {
                    console.log('User not registered');
                    await this.loadPlatformStats();
                }
            } catch (contractError) {
                console.error('Contract interaction failed:', contractError);
                this.showNotification('Contract not available. You can still register for when it\'s deployed.', 'info');
                this.isTestMode = true;
                this.loadTestStats();
            }
        } catch (error) {
            console.error('Error loading user data:', error);
            this.showNotification(`Error: ${error.message}`, 'error');
            this.showRegistrationForm();
            this.loadTestStats();
        }
    }

    showRegistrationForm() {
        console.log('Showing registration form');
        document.getElementById('registrationSection').classList.remove('hidden');

        // In test mode, don't hide stats section
        if (!this.isTestMode) {
            this.hideAllSections(['dashboardSection', 'matchRequestsSection', 'myMatchesSection', 'statsSection']);
        } else {
            this.hideAllSections(['dashboardSection', 'matchRequestsSection', 'myMatchesSection']);
        }
    }

    showDashboard() {
        document.getElementById('dashboardSection').classList.remove('hidden');
        document.getElementById('matchRequestsSection').classList.remove('hidden');
        document.getElementById('myMatchesSection').classList.remove('hidden');
        document.getElementById('statsSection').classList.remove('hidden');
        this.hideAllSections(['registrationSection']);
    }

    hideAllSections(exceptSections = []) {
        const sections = ['dashboardSection', 'matchRequestsSection', 'myMatchesSection'];
        sections.forEach(section => {
            if (!exceptSections.includes(section)) {
                console.log('Hiding section:', section);
                document.getElementById(section).classList.add('hidden');
            }
        });
    }

    async handleRegistration(event) {
        event.preventDefault();

        // Get form data at the beginning so it's available in catch block
        const formData = this.getFormData();
        if (!this.validateFormData(formData)) return;

        try {

            if (this.isTestMode) {
                this.showLoading('Creating your profile (Test Mode)...');
                // Simulate transaction delay
                await new Promise(resolve => setTimeout(resolve, 2000));

                this.hideLoading();
                this.showNotification('Profile created successfully! (Test Mode)', 'success');

                // Show test dashboard
                this.showTestDashboard(formData);
                return;
            }

            this.showLoading('Creating your profile...');

            console.log('Calling contract.registerUser with parameters:', {
                nickname: formData.nickname,
                bio: formData.bio,
                age: formData.age,
                location: formData.location,
                interests: formData.interests,
                preference: formData.preference
            });

            // Use manual gas limit instead of estimation
            const gasOptions = await this.getGasOptions(500000); // 500k gas limit for registration
            console.log('Using manual gas options:', gasOptions);

            const tx = await this.contract.registerUser(
                formData.nickname,
                formData.bio,
                formData.age,
                formData.location,
                formData.interests,
                formData.preference,
                gasOptions
            );

            this.showLoading('Waiting for confirmation...');
            await tx.wait();

            this.hideLoading();
            this.showNotification('Profile created successfully!', 'success');

            // Reload user data
            await this.loadUserData();
        } catch (error) {
            this.hideLoading();
            console.error('Error registering user:', error);
            console.error('Error details:', {
                code: error.code,
                message: error.message,
                reason: error.reason,
                data: error.data
            });

            // If it's a gas estimation error or execution reverted, switch to test mode
            if (error.code === 'UNPREDICTABLE_GAS_LIMIT' ||
                error.message.includes('execution reverted') ||
                error.message.includes('cannot estimate gas')) {

                console.log('Contract call failed, switching to test mode');
                console.log('Form data that was being submitted:', formData);
                this.isTestMode = true;
                this.showNotification('Contract call failed. Switching to test mode for demo.', 'info');

                // Show test dashboard instead
                this.showTestDashboard(formData);
            } else {
                this.showNotification(`Failed to create profile: ${error.message}`, 'error');
            }
        }
    }

    getFormData() {
        const nickname = document.getElementById('nickname').value.trim();
        const bio = document.getElementById('bio').value.trim();
        const age = parseInt(document.getElementById('age').value) || 0;
        const location = parseInt(document.getElementById('location').value) || 0;
        const interests = parseInt(document.getElementById('interests').value) || 0;
        const preference = parseInt(document.getElementById('preference').value) || 0;

        console.log('Form data being prepared:', {
            nickname, bio, age, location, interests, preference
        });

        return {
            nickname,
            bio,
            age,
            location,
            interests,
            preference
        };
    }

    validateFormData(data) {
        console.log('Validating form data:', data);

        if (!data.nickname || data.nickname.length < 2) {
            this.showNotification('Display name must be at least 2 characters', 'error');
            return false;
        }
        if (!data.bio || data.bio.length < 10) {
            this.showNotification('Bio must be at least 10 characters', 'error');
            return false;
        }
        if (!data.age || data.age < 18 || data.age > 100) {
            this.showNotification('Age must be between 18 and 100', 'error');
            return false;
        }
        if (!data.location || data.location < 1 || data.location > 5) {
            this.showNotification('Please select a valid location preference', 'error');
            return false;
        }
        if (!data.interests || data.interests < 1 || data.interests > 8) {
            this.showNotification('Please select a valid interest category', 'error');
            return false;
        }
        if (!data.preference || data.preference < 1 || data.preference > 5) {
            this.showNotification('Please select a valid dating goal', 'error');
            return false;
        }

        console.log('✅ Form validation passed');
        return true;
    }

    async loadUserProfile() {
        try {
            const profile = await this.contract.getUserProfile(this.userId);
            const profileInfo = document.getElementById('profileInfo');

            profileInfo.innerHTML = `
                <h3>Profile Information</h3>
                <p><strong>User ID:</strong> ${this.userId}</p>
                <p><strong>Display Name:</strong> ${profile.nickname}</p>
                <p><strong>Bio:</strong> ${profile.bio}</p>
                <p><strong>Status:</strong> ${profile.isActive ? 'Active' : 'Inactive'}</p>
                <p><strong>Total Matches:</strong> ${profile.totalMatches}</p>
                <p><strong>Joined:</strong> ${new Date(Number(profile.joinedAt) * 1000).toLocaleDateString()}</p>
            `;

            // Update reactivate button visibility
            const deactivateBtn = document.getElementById('deactivateProfile');
            const reactivateBtn = document.getElementById('reactivateProfile');

            if (profile.isActive) {
                deactivateBtn.classList.remove('hidden');
                reactivateBtn.classList.add('hidden');
            } else {
                deactivateBtn.classList.add('hidden');
                reactivateBtn.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    }

    async requestMatch() {
        try {
            const targetUserId = parseInt(document.getElementById('targetUserId').value);

            if (!targetUserId || targetUserId === Number(this.userId)) {
                this.showNotification('Please enter a valid user ID', 'error');
                return;
            }

            if (this.isTestMode) {
                this.showLoading('Sending match request (Test Mode)...');
                await new Promise(resolve => setTimeout(resolve, 1000));
                this.hideLoading();
                this.showNotification(`Match request sent to User ${targetUserId}! (Test Mode)`, 'success');
                document.getElementById('targetUserId').value = '';
                return;
            }

            this.showLoading('Sending match request...');

            const gasOptions = await this.getGasOptions(300000); // 300k gas limit for match request
            const tx = await this.contract.requestMatch(targetUserId, gasOptions);
            await tx.wait();

            this.hideLoading();
            this.showNotification('Match request sent successfully!', 'success');
            document.getElementById('targetUserId').value = '';

            // Reload matches
            await this.loadMatches();
        } catch (error) {
            this.hideLoading();
            console.error('Error requesting match:', error);

            // Switch to test mode if contract fails
            if (error.code === 'UNPREDICTABLE_GAS_LIMIT' || error.message.includes('execution reverted')) {
                this.isTestMode = true;
                this.showNotification('Contract not available. Switched to test mode.', 'info');
            } else {
                this.showNotification('Failed to send match request', 'error');
            }
        }
    }

    async loadMatches() {
        try {
            const matches = await this.contract.getMyMatches();
            await this.displayMatches(matches);
        } catch (error) {
            console.error('Error loading matches:', error);
            document.getElementById('myMatches').innerHTML = '<p class="empty-state">Error loading matches</p>';
        }
    }

    async loadPendingRequests() {
        try {
            // Since we don't have a direct function to get pending requests,
            // we'll look through recent match events and filter for our user
            const filter = this.contract.filters.MatchRequested(null, null, Number(this.userId));
            const events = await this.contract.queryFilter(filter, -1000); // Last 1000 blocks

            const pendingRequests = [];
            for (let event of events) {
                const matchId = event.args.matchId;
                const requesterId = event.args.requester;

                try {
                    const matchDetails = await this.contract.getMatchDetails(matchId);

                    // Only show if not yet accepted/rejected and current user is the target (userId2)
                    if (!matchDetails.isAccepted && !matchDetails.isRejected &&
                        Number(matchDetails.userId2) === Number(this.userId)) {

                        const requesterProfile = await this.contract.getUserProfile(requesterId);
                        pendingRequests.push({
                            matchId: matchId,
                            requester: requesterId,
                            profile: requesterProfile,
                            requestTime: matchDetails.requestTime
                        });
                    }
                } catch (error) {
                    console.error('Error checking match details:', error);
                }
            }

            this.displayPendingRequests(pendingRequests);
        } catch (error) {
            console.error('Error loading pending requests:', error);
            document.getElementById('pendingRequests').innerHTML = '<p class="empty-state">Error loading requests</p>';
        }
    }

    async displayMatches(matches) {
        const myMatchesDiv = document.getElementById('myMatches');

        if (matches.length === 0) {
            myMatchesDiv.innerHTML = '<p class="empty-state">No matches yet. Start exploring!</p>';
            return;
        }

        let matchesHTML = '';
        for (let matchId of matches) {
            try {
                const matchDetails = await this.contract.getMatchDetails(matchId);
                const otherUserId = Number(matchDetails.userId1) === Number(this.userId) ? matchDetails.userId2 : matchDetails.userId1;
                const otherUserProfile = await this.contract.getUserProfile(otherUserId);

                const compatibilityDisplay = matchDetails.isRevealed
                    ? `<span class="compatibility-score">Compatibility: ${matchDetails.publicScore}%</span>`
                    : '<span class="compatibility-score">Calculating...</span>';

                const statusText = matchDetails.isAccepted ? 'Matched' :
                                 matchDetails.isRejected ? 'Rejected' : 'Pending';

                matchesHTML += `
                    <div class="match-item">
                        <div class="match-header">
                            <span class="match-name">${otherUserProfile.nickname}</span>
                            ${compatibilityDisplay}
                        </div>
                        <p class="match-bio">${otherUserProfile.bio}</p>
                        <div class="match-meta">
                            <p>Status: ${statusText}</p>
                            ${Number(matchDetails.matchTime) > 0 ?
                                `<p>Matched: ${new Date(Number(matchDetails.matchTime) * 1000).toLocaleDateString()}</p>` :
                                `<p>Requested: ${new Date(Number(matchDetails.requestTime) * 1000).toLocaleDateString()}</p>`
                            }
                        </div>
                    </div>
                `;
            } catch (error) {
                console.error('Error loading match details:', error);
            }
        }

        myMatchesDiv.innerHTML = matchesHTML;
    }

    displayPendingRequests(requests) {
        const pendingRequestsDiv = document.getElementById('pendingRequests');

        if (requests.length === 0) {
            pendingRequestsDiv.innerHTML = '<p class="empty-state">No pending requests</p>';
            return;
        }

        let requestsHTML = '';
        for (let request of requests) {
            requestsHTML += `
                <div class="request-item">
                    <div class="request-header">
                        <span class="request-name">${request.profile.nickname}</span>
                        <span class="compatibility-score">New Request</span>
                    </div>
                    <p class="request-bio">${request.profile.bio}</p>
                    <div class="request-meta">
                        <p>User ID: ${request.requester}</p>
                        <p>Requested: ${new Date(Number(request.requestTime) * 1000).toLocaleDateString()}</p>
                    </div>
                    <div class="request-actions">
                        <button class="btn btn-success" onclick="app.acceptMatch(${request.matchId})">Accept</button>
                        <button class="btn btn-danger" onclick="app.rejectMatch(${request.matchId})">Reject</button>
                    </div>
                </div>
            `;
        }

        pendingRequestsDiv.innerHTML = requestsHTML;
    }

    async acceptMatch(matchId) {
        try {
            if (this.isTestMode) {
                this.showNotification('Match accepted! (Test Mode)', 'success');
                this.showTestPendingRequests();
                return;
            }

            this.showLoading('Accepting match...');

            const gasOptions = await this.getGasOptions(200000);
            const tx = await this.contract.acceptMatch(matchId, gasOptions);
            await tx.wait();

            this.hideLoading();
            this.showNotification('Match accepted successfully!', 'success');

            // Reload matches and requests
            await this.loadMatches();
            await this.loadPendingRequests();
        } catch (error) {
            this.hideLoading();
            console.error('Error accepting match:', error);
            this.showNotification('Failed to accept match', 'error');
        }
    }

    async rejectMatch(matchId) {
        try {
            if (this.isTestMode) {
                this.showNotification('Match rejected! (Test Mode)', 'success');
                this.showTestPendingRequests();
                return;
            }

            this.showLoading('Rejecting match...');

            const gasOptions = await this.getGasOptions(200000);
            const tx = await this.contract.rejectMatch(matchId, gasOptions);
            await tx.wait();

            this.hideLoading();
            this.showNotification('Match rejected', 'success');

            // Reload requests
            await this.loadPendingRequests();
        } catch (error) {
            this.hideLoading();
            console.error('Error rejecting match:', error);
            this.showNotification('Failed to reject match', 'error');
        }
    }

    async updateVisibility() {
        try {
            const isVisible = document.getElementById('visibilityToggle').checked;

            this.showLoading('Updating visibility...');

            const gasOptions = await this.getGasOptions(150000);
            const tx = await this.contract.setVisibility(isVisible, gasOptions);
            await tx.wait();

            this.hideLoading();
            this.showNotification('Visibility updated successfully!', 'success');
        } catch (error) {
            this.hideLoading();
            console.error('Error updating visibility:', error);
            this.showNotification('Failed to update visibility', 'error');
        }
    }

    async deactivateProfile() {
        if (!confirm('Are you sure you want to deactivate your profile? You can reactivate it later.')) {
            return;
        }

        try {
            this.showLoading('Deactivating profile...');

            const gasOptions = await this.getGasOptions(150000);
            const tx = await this.contract.deactivateProfile(gasOptions);
            await tx.wait();

            this.hideLoading();
            this.showNotification('Profile deactivated successfully', 'success');

            // Reload profile data
            await this.loadUserProfile();
        } catch (error) {
            this.hideLoading();
            console.error('Error deactivating profile:', error);
            this.showNotification('Failed to deactivate profile', 'error');
        }
    }

    async reactivateProfile() {
        try {
            this.showLoading('Reactivating profile...');

            const gasOptions = await this.getGasOptions(150000);
            const tx = await this.contract.reactivateProfile(gasOptions);
            await tx.wait();

            this.hideLoading();
            this.showNotification('Profile reactivated successfully!', 'success');

            // Reload profile data
            await this.loadUserProfile();
        } catch (error) {
            this.hideLoading();
            console.error('Error reactivating profile:', error);
            this.showNotification('Failed to reactivate profile', 'error');
        }
    }

    async loadPlatformStats() {
        try {
            const [totalUsers, totalMatches] = await Promise.all([
                this.contract.getTotalUsers(),
                this.contract.getTotalMatches()
            ]);

            document.getElementById('totalUsers').textContent = totalUsers.toString();
            document.getElementById('totalMatches').textContent = totalMatches.toString();
        } catch (error) {
            console.error('Error loading platform stats:', error);
            document.getElementById('totalUsers').textContent = '-';
            document.getElementById('totalMatches').textContent = '-';
        }
    }

    handleDisconnection() {
        this.userAccount = null;
        this.userId = null;
        this.contract = null;
        this.signer = null;

        this.updateWalletUI(false);
        this.hideAllSections();
        document.getElementById('networkInfo').classList.add('hidden');

        this.showNotification('Wallet disconnected', 'info');
    }

    async handleAccountChange(newAccount) {
        this.userAccount = newAccount;
        await this.initializeContract();
        await this.updateWalletUI(true);
        await this.loadUserData();

        this.showNotification('Account changed', 'info');
    }

    showLoading(message = 'Processing...') {
        this.isLoading = true;
        const overlay = document.getElementById('loadingOverlay');
        const messageEl = document.getElementById('loadingMessage');

        messageEl.textContent = message;
        overlay.classList.remove('hidden');
    }

    hideLoading() {
        this.isLoading = false;
        document.getElementById('loadingOverlay').classList.add('hidden');
    }

    showNotification(message, type = 'info') {
        const container = document.getElementById('notifications');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;

        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;

        container.appendChild(notification);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    // Test mode functions
    loadTestStats() {
        document.getElementById('totalUsers').textContent = '0';
        document.getElementById('totalMatches').textContent = '0';
        document.getElementById('statsSection').classList.remove('hidden');
    }

    showTestDashboard(formData) {
        // Show test profile
        const profileInfo = document.getElementById('profileInfo');
        profileInfo.innerHTML = `
            <h3>Profile Information (Test Mode)</h3>
            <p><strong>User ID:</strong> 1</p>
            <p><strong>Display Name:</strong> ${formData.nickname}</p>
            <p><strong>Bio:</strong> ${formData.bio}</p>
            <p><strong>Status:</strong> Active</p>
            <p><strong>Total Matches:</strong> 0</p>
            <p><strong>Joined:</strong> ${new Date().toLocaleDateString()}</p>
        `;

        // Show test dashboard
        this.showDashboard();

        // Show test stats
        this.loadTestStats();

        // Show test pending requests
        this.showTestPendingRequests();

        // Add test mode indicator
        this.showNotification('Running in test mode - Contract not deployed yet', 'info');
    }

    showTestPendingRequests() {
        const testRequests = [
            {
                matchId: 1,
                requester: 2,
                profile: {
                    nickname: "Alice",
                    bio: "Love hiking and outdoor activities. Looking for someone who shares my passion for nature!"
                },
                requestTime: Date.now() / 1000 - 3600 // 1 hour ago
            },
            {
                matchId: 2,
                requester: 3,
                profile: {
                    nickname: "Bob",
                    bio: "Tech enthusiast and coffee lover. Let's build something amazing together!"
                },
                requestTime: Date.now() / 1000 - 7200 // 2 hours ago
            }
        ];

        this.displayPendingRequests(testRequests);
    }
}

// Initialize the application when DOM is loaded
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new PrivacyDatingApp();
});
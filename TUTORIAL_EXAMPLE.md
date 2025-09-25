# Hello FHEVM - Quick Start Example

This is a simplified example to get you started with FHE development quickly.

## 🚀 Minimal FHE Smart Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint8, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract HelloFHE is SepoliaConfig {
    // Store encrypted age
    mapping(address => euint8) private encryptedAges;

    // Store public usernames
    mapping(address => string) public usernames;

    uint256 public userCount;

    event UserRegistered(address indexed user, string username);
    event AgeComparison(address indexed user1, address indexed user2, bool result);

    // Register with encrypted age
    function register(string memory _username, uint8 _age) external {
        require(_age >= 18 && _age <= 100, "Invalid age");
        require(bytes(_username).length > 0, "Username required");

        // Encrypt the age
        euint8 encryptedAge = FHE.asEuint8(_age);

        // Store data
        encryptedAges[msg.sender] = encryptedAge;
        usernames[msg.sender] = _username;

        // Set permissions
        FHE.allowThis(encryptedAge);
        FHE.allow(encryptedAge, msg.sender);

        userCount++;
        emit UserRegistered(msg.sender, _username);
    }

    // Compare ages without revealing them
    function compareAges(address _otherUser) external returns (bool) {
        require(encryptedAges[msg.sender].unwrap() != 0, "You must register first");
        require(encryptedAges[_otherUser].unwrap() != 0, "Other user not registered");

        // Compare encrypted ages: is my age >= other user's age?
        ebool result = FHE.gte(encryptedAges[msg.sender], encryptedAges[_otherUser]);

        // For demo purposes, we'll reveal this comparison result
        // In real apps, you might keep this encrypted too!
        bool isOlder = FHE.decrypt(result);

        emit AgeComparison(msg.sender, _otherUser, isOlder);
        return isOlder;
    }

    // Check if two users are within 5 years of each other
    function areAgeCompatible(address _otherUser) external view returns (bool) {
        require(encryptedAges[msg.sender].unwrap() != 0, "You must register first");
        require(encryptedAges[_otherUser].unwrap() != 0, "Other user not registered");

        // Calculate age difference
        euint8 ageDiff1 = FHE.sub(encryptedAges[msg.sender], encryptedAges[_otherUser]);
        euint8 ageDiff2 = FHE.sub(encryptedAges[_otherUser], encryptedAges[msg.sender]);

        // Check if either difference is <= 5
        ebool compatible1 = FHE.le(ageDiff1, FHE.asEuint8(5));
        ebool compatible2 = FHE.le(ageDiff2, FHE.asEuint8(5));

        // Return true if either direction shows compatibility
        ebool compatible = FHE.or(compatible1, compatible2);

        return FHE.decrypt(compatible);
    }
}
```

## 🌐 Simple Frontend

```html
<!DOCTYPE html>
<html>
<head>
    <title>Hello FHE Example</title>
    <script src="https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.umd.min.js"></script>
</head>
<body>
    <h1>Hello FHE - Age Comparison Demo</h1>

    <div id="wallet">
        <button onclick="connectWallet()">Connect Wallet</button>
        <p id="walletStatus"></p>
    </div>

    <div id="register" style="display:none;">
        <h2>Register (Your age will be encrypted!)</h2>
        <input type="text" id="username" placeholder="Your username">
        <input type="number" id="age" placeholder="Your age (18-100)">
        <button onclick="register()">Register</button>
    </div>

    <div id="compare" style="display:none;">
        <h2>Compare Ages</h2>
        <input type="text" id="otherUser" placeholder="Other user's address">
        <button onclick="compareAges()">Am I Older?</button>
        <button onclick="checkCompatibility()">Are We Age Compatible?</button>
        <p id="result"></p>
    </div>

    <script>
        const CONTRACT_ADDRESS = "YOUR_CONTRACT_ADDRESS";
        const ABI = [
            "function register(string _username, uint8 _age) external",
            "function compareAges(address _otherUser) external returns (bool)",
            "function areAgeCompatible(address _otherUser) external view returns (bool)",
            "function usernames(address) external view returns (string)",
            "function userCount() external view returns (uint256)"
        ];

        let contract, signer, userAddress;

        async function connectWallet() {
            const provider = new ethers.providers.Web3Provider(window.ethereum);
            await provider.send("eth_requestAccounts", []);
            signer = provider.getSigner();
            userAddress = await signer.getAddress();
            contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

            document.getElementById('walletStatus').textContent = `Connected: ${userAddress}`;
            document.getElementById('register').style.display = 'block';
            document.getElementById('compare').style.display = 'block';
        }

        async function register() {
            const username = document.getElementById('username').value;
            const age = document.getElementById('age').value;

            try {
                console.log("Registering with encrypted age...");
                const tx = await contract.register(username, age);
                await tx.wait();
                alert("✅ Registered! Your age is now encrypted on-chain.");
            } catch (error) {
                alert("❌ Registration failed: " + error.message);
            }
        }

        async function compareAges() {
            const otherUser = document.getElementById('otherUser').value;

            try {
                console.log("Comparing encrypted ages...");
                const tx = await contract.compareAges(otherUser);
                const receipt = await tx.wait();

                // The result is in the transaction events
                const result = receipt.events?.[0]?.args?.[2];
                document.getElementById('result').textContent =
                    result ? "🎂 You are older!" : "👶 You are younger!";

            } catch (error) {
                document.getElementById('result').textContent = "❌ Comparison failed: " + error.message;
            }
        }

        async function checkCompatibility() {
            const otherUser = document.getElementById('otherUser').value;

            try {
                console.log("Checking age compatibility...");
                const compatible = await contract.areAgeCompatible(otherUser);
                document.getElementById('result').textContent =
                    compatible ? "💕 You are age compatible!" : "❌ Not age compatible (>5 years apart)";

            } catch (error) {
                document.getElementById('result').textContent = "❌ Compatibility check failed: " + error.message;
            }
        }
    </script>
</body>
</html>
```

## 🔑 Key Learning Points

### 1. **FHE Data Types**
```solidity
euint8 encryptedAge;    // Encrypted 8-bit integer (0-255)
ebool isCompatible;     // Encrypted boolean (true/false)
```

### 2. **Encryption**
```solidity
euint8 encrypted = FHE.asEuint8(25);  // Encrypt plain value 25
```

### 3. **Encrypted Operations**
```solidity
FHE.gte(a, b)   // Greater than or equal: a >= b
FHE.le(a, b)    // Less than or equal: a <= b
FHE.sub(a, b)   // Subtraction: a - b
FHE.or(a, b)    // Logical OR: a || b
```

### 4. **Access Control**
```solidity
FHE.allowThis(encrypted);        // Contract can use this data
FHE.allow(encrypted, user);      // User can decrypt this data
```

### 5. **Decryption (when needed)**
```solidity
bool result = FHE.decrypt(encryptedBool);  // Reveal encrypted boolean
```

## 💡 What Makes This Special?

- **👥 Two users register with ages 25 and 30**
- **🔒 Both ages are encrypted on-chain**
- **🧮 Contract can calculate: 25 <= 30 (true)**
- **🎯 Contract never sees the actual numbers 25 or 30!**
- **✨ Pure privacy-preserving computation**

This is the magic of FHE - computation on encrypted data without ever revealing the underlying values!

## 📚 Next Steps

1. Deploy this simple contract to Sepolia testnet
2. Test with multiple users and different ages
3. Extend with more complex calculations
4. Build the full Private Dating Platform from the main tutorial

Ready to build privacy-first applications? Start here and then move to the complete tutorial! 🚀
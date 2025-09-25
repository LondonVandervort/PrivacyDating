const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("🚀 开始部署和配置隐私约会平台...");

    // 获取部署账户
    const [deployer] = await hre.ethers.getSigners();
    console.log("部署账户:", deployer.address);

    // 获取账户余额
    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("账户余额:", hre.ethers.formatEther(balance), "ETH");

    try {
        // 部署PrivateDating合约
        console.log("\n📦 正在部署PrivateDating合约...");
        const PrivateDating = await hre.ethers.getContractFactory("PrivateDating");
        const privateDating = await PrivateDating.deploy();

        await privateDating.waitForDeployment();
        const contractAddress = await privateDating.getAddress();

        console.log("✅ PrivateDating合约部署成功!");
        console.log("📋 合约地址:", contractAddress);

        // 验证部署
        console.log("\n⏳ 验证合约部署状态...");
        const owner = await privateDating.owner();
        const userCount = await privateDating.userCount();
        const matchCount = await privateDating.matchCount();

        console.log("👤 合约所有者:", owner);
        console.log("📊 当前用户数:", userCount.toString());
        console.log("💕 当前匹配数:", matchCount.toString());

        // 等待几个确认
        console.log("\n⏳ 等待区块确认...");
        await privateDating.deploymentTransaction()?.wait(2);
        console.log("✅ 合约已获得确认");

        // 自动更新前端合约地址
        console.log("\n📝 正在更新前端合约地址...");
        await updateFrontendConfig(contractAddress);

        // 保存部署信息到文件
        const deploymentInfo = {
            network: hre.network.name,
            contractAddress: contractAddress,
            deployerAddress: deployer.address,
            deploymentTime: new Date().toISOString(),
            blockNumber: await hre.ethers.provider.getBlockNumber(),
            transactionHash: privateDating.deploymentTransaction()?.hash
        };

        const deploymentPath = path.join(__dirname, '..', 'deployment.json');
        fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
        console.log("💾 部署信息已保存到 deployment.json");

        console.log("\n📄 部署信息:");
        console.log("🌐 网络:", deploymentInfo.network);
        console.log("📋 合约地址:", deploymentInfo.contractAddress);
        console.log("👤 部署者:", deploymentInfo.deployerAddress);
        console.log("⏰ 部署时间:", deploymentInfo.deploymentTime);
        console.log("📦 区块号:", deploymentInfo.blockNumber);

        if (deploymentInfo.transactionHash) {
            console.log("🔗 交易哈希:", deploymentInfo.transactionHash);
        }

        console.log("\n🎉 隐私约会平台部署和配置完成!");
        console.log("💡 现在可以访问 http://localhost:1033 开始使用");
        console.log("🔍 在Etherscan查看合约:", getEtherscanUrl(hre.network.name, contractAddress));

        return {
            privateDating: privateDating,
            address: contractAddress,
            deploymentInfo: deploymentInfo
        };

    } catch (error) {
        console.error("❌ 部署失败:", error.message);

        if (error.message.includes("insufficient funds")) {
            console.log("\n💡 解决方案:");
            console.log("1. 确保账户有足够的ETH用于部署");
            console.log("2. 获取测试网代币: https://faucet.sepolia.dev/");
        } else if (error.message.includes("nonce")) {
            console.log("\n💡 解决方案:");
            console.log("1. 等待几秒后重试");
            console.log("2. 或者重置MetaMask账户");
        }

        throw error;
    }
}

// 更新前端配置
async function updateFrontendConfig(contractAddress) {
    const indexPath = path.join(__dirname, '..', 'public', 'index.html');

    if (fs.existsSync(indexPath)) {
        let content = fs.readFileSync(indexPath, 'utf8');

        // 替换合约地址
        const oldAddress = 'const CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000";';
        const newAddress = `const CONTRACT_ADDRESS = "${contractAddress}";`;

        content = content.replace(oldAddress, newAddress);

        fs.writeFileSync(indexPath, content);
        console.log("✅ 前端合约地址已更新");
    } else {
        console.log("⚠️  未找到前端文件，请手动更新合约地址");
    }
}

// 获取区块浏览器链接
function getEtherscanUrl(network, address) {
    switch (network) {
        case 'sepolia':
            return `https://sepolia.etherscan.io/address/${address}`;
        case 'mainnet':
            return `https://etherscan.io/address/${address}`;
        case 'goerli':
            return `https://goerli.etherscan.io/address/${address}`;
        default:
            return `网络 ${network} 上的合约: ${address}`;
    }
}

// 执行部署
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = main;
const hre = require("hardhat");

async function main() {
    console.log("开始部署隐私约会平台合约...");

    // 获取部署账户
    const [deployer] = await hre.ethers.getSigners();
    console.log("部署账户:", deployer.address);

    // 获取账户余额
    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("账户余额:", hre.ethers.formatEther(balance), "ETH");

    try {
        // 部署PrivateDating合约
        console.log("\n正在部署PrivateDating合约...");
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

        // 保存部署信息
        const deploymentInfo = {
            network: hre.network.name,
            contractAddress: contractAddress,
            deployerAddress: deployer.address,
            deploymentTime: new Date().toISOString(),
            blockNumber: await hre.ethers.provider.getBlockNumber(),
            transactionHash: privateDating.deploymentTransaction()?.hash
        };

        console.log("\n📄 部署信息:");
        console.log("🌐 网络:", deploymentInfo.network);
        console.log("📋 合约地址:", deploymentInfo.contractAddress);
        console.log("👤 部署者:", deploymentInfo.deployerAddress);
        console.log("⏰ 部署时间:", deploymentInfo.deploymentTime);
        console.log("📦 区块号:", deploymentInfo.blockNumber);

        if (deploymentInfo.transactionHash) {
            console.log("🔗 交易哈希:", deploymentInfo.transactionHash);
        }

        // 等待几个确认
        console.log("\n⏳ 等待区块确认...");
        await privateDating.deploymentTransaction()?.wait(2);
        console.log("✅ 合约已获得确认");

        console.log("\n🎉 隐私约会平台部署完成!");
        console.log("💡 你现在可以开始使用这个机密交友系统了");

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
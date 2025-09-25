const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying Privacy Dating Platform to local network...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  try {
    const PrivacyDating = await ethers.getContractFactory("PrivacyDating");

    console.log("Deploying contract...");
    const contract = await PrivacyDating.deploy();

    console.log("Waiting for deployment...");
    await contract.deployed();

    console.log("Privacy Dating Platform deployed to:", contract.address);
    console.log("Transaction hash:", contract.deployTransaction.hash);

    // Update the frontend with the new contract address
    console.log("\n=== DEPLOYMENT SUCCESSFUL ===");
    console.log("Contract Address:", contract.address);
    console.log("Please update the CONTRACT_ADDRESS in app.js to:", contract.address);

    return contract.address;
  } catch (error) {
    console.error("Deployment failed:", error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying Privacy Dating Platform...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  const PrivacyDating = await ethers.getContractFactory("PrivacyDating");
  const contract = await PrivacyDating.deploy();

  await contract.deployed();

  console.log("Privacy Dating Platform deployed to:", contract.address);
  console.log("Transaction hash:", contract.deployTransaction.hash);

  // Wait for a few confirmations
  console.log("Waiting for confirmations...");
  await contract.deployTransaction.wait(3);

  console.log("Contract deployed and confirmed!");

  // Verify contract on Etherscan
  if (network.name !== "localhost" && network.name !== "hardhat") {
    console.log("Verifying contract on Etherscan...");
    try {
      await hre.run("verify:verify", {
        address: contract.address,
        constructorArguments: [],
      });
      console.log("Contract verified successfully");
    } catch (error) {
      console.log("Error verifying contract:", error.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
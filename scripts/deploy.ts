/**
 * deploy.ts — ShiftEscrow deployment script
 *
 * Run with:
 *   npx hardhat run scripts/deploy.ts --network somniaTestnet
 *
 * What this does:
 *   1. Compiles the contract
 *   2. Deploys to Somnia Testnet
 *   3. Prints the address — paste this into frontend/lib/config.ts
 *   4. Verifies on the block explorer (optional)
 */

import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("\n🚀 Deploying ShiftEscrow to Somnia...");
  console.log("   Deployer address:", deployer.address);

  // Check balance before deploying — you need STT for gas
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("   Deployer balance:", ethers.formatEther(balance), "STT");

  if (balance === 0n) {
    throw new Error(
      "Deployer has no STT. Get testnet tokens at https://testnet.somnia.network/faucet"
    );
  }

  // Deploy
  const ShiftEscrow = await ethers.getContractFactory("ShiftEscrow");
  const contract = await ShiftEscrow.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("\n✅ ShiftEscrow deployed!");
  console.log("   Contract address:", address);
  console.log("   Network:", (await ethers.provider.getNetwork()).name);
  console.log("\n📋 Next steps:");
  console.log(`   1. Copy address into frontend/lib/config.ts → CONTRACT_ADDRESS`);
  console.log(`   2. Check agent IDs at https://agents.somnia.network`);
  console.log(`   3. Update JSON_API_AGENT_ID and LLM_AGENT_ID in ShiftEscrow.sol`);
  console.log(`   4. Re-deploy if you changed agent IDs`);
  console.log(`   5. View on explorer: https://explorer.somnia.network/address/${address}`);

  // Optional: verify on the explorer so judges can read the source code
  // npx hardhat verify --network somniaTestnet <address>
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

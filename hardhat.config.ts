import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

// Your deployer wallet private key — NEVER commit this, use .env
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    // ── Somnia Testnet (chain ID 50312) ──────────────────────────
    // Get free STT from: https://testnet.somnia.network/faucet
    // Start here. Zero cost, same API as mainnet.
    somniaTestnet: {
      url: "https://dream-rpc.somnia.network",
      chainId: 50312,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    // ── Somnia Mainnet (chain ID 5031) ───────────────────────────
    // Only deploy here for the final hackathon submission.
    // You'll need real SOMI tokens.
    somniaMainnet: {
      url: "https://rpc.somnia.network",
      chainId: 5031,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  // Block explorer for verifying contracts — swap in Somnia's
  // explorer URL once you have it from https://docs.somnia.network
  etherscan: {
    apiKey: {
      somniaTestnet: "no-api-key-needed", // Somnia explorer may not require this
    },
    customChains: [
      {
        network: "somniaTestnet",
        chainId: 50312,
        urls: {
          apiURL: "https://explorer.somnia.network/api",
          browserURL: "https://explorer.somnia.network",
        },
      },
    ],
  },
};

export default config;

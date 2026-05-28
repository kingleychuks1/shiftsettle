import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    // Somnia Testnet — chain ID 50312
    // Platform address: 0x5E5205CF39E766118C01636bED000A54D93163E6 (confirmed from code generators)
    // RPC: https://dream-rpc.somnia.network (confirmed from TypeScript generator)
    somniaTestnet: {
      url: "https://dream-rpc.somnia.network",
      chainId: 50312,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    // Somnia Mainnet — chain ID 5031
    somniaMainnet: {
      url: "https://rpc.somnia.network",
      chainId: 5031,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};

export default config;

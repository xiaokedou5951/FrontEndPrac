import { createConfig, http, injected } from "wagmi";
import { chain, rpcUrl } from "@/config/shared";

export const wagmiConfig = createConfig({
  chains: [chain],
  transports: {
    [chain.id]: http(rpcUrl),
  },
  connectors: [injected()],
});

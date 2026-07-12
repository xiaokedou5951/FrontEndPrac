// 共享的 ERC20 ABI（TokenBank 与 NFTMarket 都需要操作支付代币）
export const erc20Abi = [
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [{ type: "string", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ type: "string", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ type: "uint8", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ type: "address", name: "account" }],
    outputs: [{ type: "uint256", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { type: "address", name: "owner" },
      { type: "address", name: "spender" },
    ],
    outputs: [{ type: "uint256", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { type: "address", name: "spender" },
      { type: "uint256", name: "value" },
    ],
    outputs: [{ type: "bool", name: "" }],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "Approval",
    inputs: [
      { type: "address", name: "owner", indexed: true },
      { type: "address", name: "spender", indexed: true },
      { type: "uint256", name: "value", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { type: "address", name: "from", indexed: true },
      { type: "address", name: "to", indexed: true },
      { type: "uint256", name: "value", indexed: false },
    ],
    anonymous: false,
  },
] as const;

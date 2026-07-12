// TokenBank 合约 ABI
export const tokenBankAbi = [
  {
    type: "function",
    name: "deposit",
    inputs: [{ type: "uint256", name: "_amount" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [{ type: "uint256", name: "_amount" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ type: "address", name: "_user" }],
    outputs: [{ type: "uint256", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "deposits",
    inputs: [{ type: "address", name: "" }],
    outputs: [{ type: "uint256", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "token",
    inputs: [],
    outputs: [{ type: "address", name: "" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "Deposit",
    inputs: [
      { type: "address", name: "user", indexed: true },
      { type: "uint256", name: "amount", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Withdraw",
    inputs: [
      { type: "address", name: "user", indexed: true },
      { type: "uint256", name: "amount", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "SafeERC20FailedOperation",
    inputs: [{ type: "address", name: "token" }],
  },
] as const;

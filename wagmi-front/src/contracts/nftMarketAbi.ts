// NFTMarket 相关 ABI：市场合约 + 事件 + 所用到的 ERC721 接口

// 最小 ERC721 ABI，用于授权和查询所有权
export const erc721Abi = [
  {
    type: "function",
    name: "ownerOf",
    inputs: [{ type: "uint256", name: "tokenId" }],
    outputs: [{ type: "address", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { type: "address", name: "to" },
      { type: "uint256", name: "tokenId" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setApprovalForAll",
    inputs: [
      { type: "address", name: "operator" },
      { type: "bool", name: "approved" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "isApprovedForAll",
    inputs: [
      { type: "address", name: "owner" },
      { type: "address", name: "operator" },
    ],
    outputs: [{ type: "bool", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getApproved",
    inputs: [{ type: "uint256", name: "tokenId" }],
    outputs: [{ type: "address", name: "" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "Approval",
    inputs: [
      { type: "address", name: "owner", indexed: true },
      { type: "address", name: "approved", indexed: true },
      { type: "uint256", name: "tokenId", indexed: true },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { type: "address", name: "from", indexed: true },
      { type: "address", name: "to", indexed: true },
      { type: "uint256", name: "tokenId", indexed: true },
    ],
    anonymous: false,
  },
] as const;

// NFTMarket 合约 ABI
export const nftMarketAbi = [
  {
    type: "function",
    name: "paymentToken",
    inputs: [],
    outputs: [{ type: "address", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nextListingId",
    inputs: [],
    outputs: [{ type: "uint256", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "listings",
    inputs: [{ type: "uint256", name: "" }],
    outputs: [
      {
        type: "tuple",
        name: "",
        components: [
          { type: "address", name: "seller" },
          { type: "address", name: "nftContract" },
          { type: "uint256", name: "tokenId" },
          { type: "uint256", name: "price" },
          { type: "bool", name: "isActive" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "list",
    inputs: [
      { type: "address", name: "_nftContract" },
      { type: "uint256", name: "_tokenId" },
      { type: "uint256", name: "_price" },
    ],
    outputs: [{ type: "uint256", name: "" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "cancelListing",
    inputs: [{ type: "uint256", name: "_listingId" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "buyNFT",
    inputs: [{ type: "uint256", name: "_listingId" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "buyNFTWithCallback",
    inputs: [{ type: "uint256", name: "_listingId" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "NFTListed",
    inputs: [
      { type: "uint256", name: "listingId", indexed: true },
      { type: "address", name: "seller", indexed: true },
      { type: "address", name: "nftContract", indexed: true },
      { type: "uint256", name: "tokenId", indexed: false },
      { type: "uint256", name: "price", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "NFTSold",
    inputs: [
      { type: "uint256", name: "listingId", indexed: true },
      { type: "address", name: "buyer", indexed: true },
      { type: "address", name: "seller", indexed: true },
      { type: "address", name: "nftContract", indexed: false },
      { type: "uint256", name: "tokenId", indexed: false },
      { type: "uint256", name: "price", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "NFTListingCancelled",
    inputs: [
      { type: "uint256", name: "listingId", indexed: true },
    ],
    anonymous: false,
  },
] as const;

// NFTMarket 事件列表（watchEvent 需要单独传入 events，不能用完整 abi）
export const nftMarketEvents = [
  {
    type: "event",
    name: "NFTListed",
    inputs: [
      { type: "uint256", name: "listingId", indexed: true },
      { type: "address", name: "seller", indexed: true },
      { type: "address", name: "nftContract", indexed: true },
      { type: "uint256", name: "tokenId", indexed: false },
      { type: "uint256", name: "price", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "NFTSold",
    inputs: [
      { type: "uint256", name: "listingId", indexed: true },
      { type: "address", name: "buyer", indexed: true },
      { type: "address", name: "seller", indexed: true },
      { type: "address", name: "nftContract", indexed: false },
      { type: "uint256", name: "tokenId", indexed: false },
      { type: "uint256", name: "price", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "NFTListingCancelled",
    inputs: [
      { type: "uint256", name: "listingId", indexed: true },
    ],
    anonymous: false,
  },
] as const;

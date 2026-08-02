// AirdropMerkleNFTMarket 合约 ABI：Merkle 白名单 + permit + multicall 50% 优惠购买

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

// AirdropMerkleNFTMarket 合约 ABI
export const airdropMerkleNftMarketAbi = [
  {
    type: "function",
    name: "paymentToken",
    inputs: [],
    outputs: [{ type: "address", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "merkleRoot",
    inputs: [],
    outputs: [{ type: "bytes32", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ type: "address", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "claimed",
    inputs: [{ type: "address", name: "" }],
    outputs: [{ type: "bool", name: "" }],
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
    name: "permitPrePay",
    inputs: [
      { type: "uint256", name: "amount" },
      { type: "uint256", name: "deadline" },
      { type: "uint8", name: "v" },
      { type: "bytes32", name: "r" },
      { type: "bytes32", name: "s" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimNFT",
    inputs: [
      { type: "uint256", name: "_listingId" },
      { type: "bytes32[]", name: "_proof" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setMerkleRoot",
    inputs: [{ type: "bytes32", name: "_merkleRoot" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "multicall",
    inputs: [{ type: "bytes[]", name: "data" }],
    outputs: [{ type: "bytes[]", name: "results" }],
    stateMutability: "payable",
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
  {
    type: "event",
    name: "NFTClaimed",
    inputs: [
      { type: "uint256", name: "listingId", indexed: true },
      { type: "address", name: "buyer", indexed: true },
      { type: "address", name: "seller", indexed: true },
      { type: "address", name: "nftContract", indexed: false },
      { type: "uint256", name: "tokenId", indexed: false },
      { type: "uint256", name: "paidAmount", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "MerkleRootUpdated",
    inputs: [{ type: "bytes32", name: "newRoot", indexed: true }],
    anonymous: false,
  },
] as const;

// 事件子集（watchEvent 单独传入 events）
export const airdropMerkleEvents = [
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
  {
    type: "event",
    name: "NFTClaimed",
    inputs: [
      { type: "uint256", name: "listingId", indexed: true },
      { type: "address", name: "buyer", indexed: true },
      { type: "address", name: "seller", indexed: true },
      { type: "address", name: "nftContract", indexed: false },
      { type: "uint256", name: "tokenId", indexed: false },
      { type: "uint256", name: "paidAmount", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "MerkleRootUpdated",
    inputs: [{ type: "bytes32", name: "newRoot", indexed: true }],
    anonymous: false,
  },
] as const;

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/utils/Multicall.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

// 导入IERC20接口，用于与ERC20代币交互
interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}

// 定义接收代币回调的接口
interface ITokenReceiver {
    function tokensReceived(address from, uint256 amount, bytes calldata data) external returns (bool);
}

// 简单的ERC721接口
interface IERC721 {
    function ownerOf(uint256 tokenId) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function isApprovedForAll(address owner, address operator) external view returns (bool);
    function getApproved(uint256 tokenId) external view returns (address);
}

// 扩展的ERC20接口，添加带有回调功能的转账函数
interface IExtendedERC20 is IERC20 {
    function transferWithCallbackAndData(address _to, uint256 _value, bytes calldata _data) external returns (bool);
}

// EIP-2612 permit 接口（本地定义，避免与 OZ IERC20Permit 类型冲突）
interface IERC20WithPermit {
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external;
}

// NFT市场合约（基于Merkle白名单 + permit + multicall 的空投优惠购买）
contract AirdropMerkleNFTMarket is ITokenReceiver, Ownable, Multicall {
    // 扩展的ERC20代币合约地址
    IExtendedERC20 public paymentToken;

    // Merkle树根，用于白名单验证
    bytes32 public merkleRoot;

    // 记录已领取优惠空投的地址，每个白名单地址仅能领取一次
    mapping(address => bool) public claimed;

    // NFT上架信息结构体
    struct Listing {
        address seller;      // 卖家地址
        address nftContract; // NFT合约地址
        uint256 tokenId;     // NFT的tokenId
        uint256 price;       // 价格（以Token为单位）
        bool isActive;       // 是否处于活跃状态
    }

    // 所有上架的NFT，使用listingId作为唯一标识
    mapping(uint256 => Listing) public listings;
    uint256 public nextListingId;

    // NFT上架和购买事件
    event NFTListed(uint256 indexed listingId, address indexed seller, address indexed nftContract, uint256 tokenId, uint256 price);
    event NFTSold(uint256 indexed listingId, address indexed buyer, address indexed seller, address nftContract, uint256 tokenId, uint256 price);
    event NFTListingCancelled(uint256 indexed listingId);
    event MerkleRootUpdated(bytes32 newRoot);
    event NFTClaimed(uint256 indexed listingId, address indexed buyer, address indexed seller, address nftContract, uint256 tokenId, uint256 paidAmount);

    // 构造函数，设置支付代币地址和Merkle根
    constructor(address _paymentTokenAddress, bytes32 _merkleRoot) Ownable(msg.sender) {
        require(_paymentTokenAddress != address(0), "AirdropMerkleNFTMarket: payment token address cannot be zero");
        require(_merkleRoot != bytes32(0), "AirdropMerkleNFTMarket: merkle root cannot be zero");
        paymentToken = IExtendedERC20(_paymentTokenAddress);
        merkleRoot = _merkleRoot;
    }

    // 更新Merkle根（仅owner）
    function setMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        require(_merkleRoot != bytes32(0), "AirdropMerkleNFTMarket: merkle root cannot be zero");
        merkleRoot = _merkleRoot;
        emit MerkleRootUpdated(_merkleRoot);
    }

    // 上架NFT
    function list(address _nftContract, uint256 _tokenId, uint256 _price) external returns (uint256) {
        // 检查价格是否大于0
        require(_price > 0, "AirdropMerkleNFTMarket: price must be greater than zero");

        // 检查NFT合约地址是否有效
        require(_nftContract != address(0), "AirdropMerkleNFTMarket: NFT contract address cannot be zero");

        // 检查调用者是否为NFT的所有者或已获得授权
        IERC721 nftContract = IERC721(_nftContract);
        address owner = nftContract.ownerOf(_tokenId);
        require(
            owner == msg.sender ||
            nftContract.isApprovedForAll(owner, msg.sender) ||
            nftContract.getApproved(_tokenId) == msg.sender,
            "AirdropMerkleNFTMarket: caller is not owner nor approved"
        );

        // 创建新的上架信息
        uint256 listingId = nextListingId;
        listings[listingId] = Listing({
            seller: owner,
            nftContract: _nftContract,
            tokenId: _tokenId,
            price: _price,
            isActive: true
        });

        // 增加listingId计数器
        nextListingId++;

        // 触发NFT上架事件
        emit NFTListed(listingId, owner, _nftContract, _tokenId, _price);

        return listingId;
    }

    // 取消上架NFT
    function cancelListing(uint256 _listingId) external {
        // 检查上架信息是否存在且处于活跃状态
        Listing storage listing = listings[_listingId];
        require(listing.isActive, "AirdropMerkleNFTMarket: listing is not active");

        // 检查调用者是否为卖家
        require(listing.seller == msg.sender, "AirdropMerkleNFTMarket: caller is not the seller");

        // 将上架信息标记为非活跃
        listing.isActive = false;

        // 触发NFT上架取消事件
        emit NFTListingCancelled(_listingId);
    }

    // 普通购买NFT功能（原价）
    function buyNFT(uint256 _listingId) external {
        // 检查上架信息是否存在且处于活跃状态
        Listing storage listing = listings[_listingId];
        require(listing.isActive, "AirdropMerkleNFTMarket: listing is not active");

        // 检查买家是否有足够的代币
        require(paymentToken.balanceOf(msg.sender) >= listing.price, "AirdropMerkleNFTMarket: insufficient token balance");

        // 将上架信息标记为非活跃
        listing.isActive = false;

        // 处理代币转账（买家 -> 卖家）
        bool success = paymentToken.transferFrom(msg.sender, listing.seller, listing.price);
        require(success, "AirdropMerkleNFTMarket: token transfer failed");

        // 处理NFT转移（卖家 -> 买家）
        IERC721(listing.nftContract).transferFrom(listing.seller, msg.sender, listing.tokenId);

        // 触发NFT售出事件
        emit NFTSold(_listingId, msg.sender, listing.seller, listing.nftContract, listing.tokenId, listing.price);
    }

    // 第一步：通过EIP-2612 permit授权市场合约支配买家Token
    // 在multicall中作为第一步调用，授权后续claimNFT所需的transferFrom
    function permitPrePay(uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external {
        IERC20WithPermit(address(paymentToken)).permit(msg.sender, address(this), amount, deadline, v, r, s);
    }

    // 第二步：Merkle白名单验证 + 50%优惠价购买NFT
    // 依赖permitPrePay留下的授权（或买家预先approve），通过transferFrom扣款
    function claimNFT(uint256 _listingId, bytes32[] calldata _proof) external {
        // 1. 校验尚未领取
        require(!claimed[msg.sender], "AirdropMerkleNFTMarket: already claimed");

        // 2. Merkle白名单验证（叶子 = keccak256(abi.encodePacked(msg.sender))）
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender));
        require(MerkleProof.verify(_proof, merkleRoot, leaf), "AirdropMerkleNFTMarket: not in whitelist");

        // 3. 取上架信息并校验
        Listing storage listing = listings[_listingId];
        require(listing.isActive, "AirdropMerkleNFTMarket: listing is not active");

        // 4. 计算50%优惠价
        uint256 payAmount = listing.price / 2;
        require(paymentToken.balanceOf(msg.sender) >= payAmount, "AirdropMerkleNFTMarket: insufficient token balance");

        // 5. 状态前置更新（checks-effects-interactions，防重入）
        listing.isActive = false;
        claimed[msg.sender] = true;

        // 6. 利用permitPrePay的授权：买家 -> 卖家
        bool success = paymentToken.transferFrom(msg.sender, listing.seller, payAmount);
        require(success, "AirdropMerkleNFTMarket: token transfer failed");

        // 7. NFT：卖家 -> 买家
        IERC721(listing.nftContract).transferFrom(listing.seller, msg.sender, listing.tokenId);

        // 8. 触发事件
        emit NFTClaimed(_listingId, msg.sender, listing.seller, listing.nftContract, listing.tokenId, payAmount);
        emit NFTSold(_listingId, msg.sender, listing.seller, listing.nftContract, listing.tokenId, payAmount);
    }

    // 实现tokensReceived接口，处理通过transferWithCallback接收到的代币
    function tokensReceived(address from, uint256 amount, bytes calldata data) external override returns (bool) {
        // 检查调用者是否为支付代币合约
        require(msg.sender == address(paymentToken), "AirdropMerkleNFTMarket: caller is not the payment token contract");

        // 解析附加数据，获取listingId
        require(data.length == 32, "AirdropMerkleNFTMarket: invalid data length");
        uint256 listingId = abi.decode(data, (uint256));

        // 检查上架信息是否存在且处于活跃状态
        Listing storage listing = listings[listingId];
        require(listing.isActive, "AirdropMerkleNFTMarket: listing is not active");

        // 检查转入的代币数量是否等于NFT价格（回调路径走原价）
        require(amount == listing.price, "AirdropMerkleNFTMarket: incorrect payment amount");

        // 将上架信息标记为非活跃
        listing.isActive = false;

        // 将代币转给卖家
        bool success = paymentToken.transfer(listing.seller, amount);
        require(success, "AirdropMerkleNFTMarket: token transfer to seller failed");

        // 处理NFT转移（卖家 -> 买家）
        IERC721(listing.nftContract).transferFrom(listing.seller, from, listing.tokenId);

        // 触发NFT售出事件
        emit NFTSold(listingId, from, listing.seller, listing.nftContract, listing.tokenId, amount);

        return true;
    }

    // 使用transferWithCallbackAndData购买NFT的辅助函数
    function buyNFTWithCallback(uint256 _listingId) external {
        // 检查上架信息是否存在且处于活跃状态
        Listing storage listing = listings[_listingId];
        require(listing.isActive, "AirdropMerkleNFTMarket: listing is not active");

        // 检查买家是否有足够的代币
        require(paymentToken.balanceOf(msg.sender) >= listing.price, "AirdropMerkleNFTMarket: insufficient token balance");

        // 编码listingId作为附加数据
        bytes memory data = abi.encode(_listingId);

        // 调用transferWithCallbackAndData函数，将代币转给市场合约并附带listingId数据
        bool success = paymentToken.transferWithCallbackAndData(address(this), listing.price, data);
        require(success, "AirdropMerkleNFTMarket: token transfer with callback failed");
    }
}

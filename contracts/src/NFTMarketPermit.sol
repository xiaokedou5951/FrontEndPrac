// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

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

// NFT市场合约（带白名单许可购买功能）
contract NFTMarketPermit is ITokenReceiver {
    // 扩展的ERC20代币合约地址
    IExtendedERC20 public paymentToken;

    // 项目方签名地址，用于验证白名单购买签名
    address public signer;

    // EIP-712 类型哈希
    bytes32 public constant PERMIT_TYPEHASH = keccak256("PermitBuy(address buyer,uint256 listingId)");

    // EIP-712 域分隔符
    bytes32 public domainSeparator;

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

    // 构造函数，设置支付代币地址和签名地址
    constructor(address _paymentTokenAddress, address _signer) {
        require(_paymentTokenAddress != address(0), "NFTMarketPermit: payment token address cannot be zero");
        require(_signer != address(0), "NFTMarketPermit: signer cannot be zero");
        paymentToken = IExtendedERC20(_paymentTokenAddress);
        signer = _signer;

        // 初始化EIP-712域分隔符
        domainSeparator = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("NFTMarketPermit")),
            block.chainid,
            address(this)
        ));
    }

    // 上架NFT
    function list(address _nftContract, uint256 _tokenId, uint256 _price) external returns (uint256) {
        // 检查价格是否大于0
        require(_price > 0, "NFTMarketPermit: price must be greater than zero");

        // 检查NFT合约地址是否有效
        require(_nftContract != address(0), "NFTMarketPermit: NFT contract address cannot be zero");

        // 检查调用者是否为NFT的所有者或已获得授权
        IERC721 nftContract = IERC721(_nftContract);
        address owner = nftContract.ownerOf(_tokenId);
        require(
            owner == msg.sender ||
            nftContract.isApprovedForAll(owner, msg.sender) ||
            nftContract.getApproved(_tokenId) == msg.sender,
            "NFTMarketPermit: caller is not owner nor approved"
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
        require(listing.isActive, "NFTMarketPermit: listing is not active");

        // 检查调用者是否为卖家
        require(listing.seller == msg.sender, "NFTMarketPermit: caller is not the seller");

        // 将上架信息标记为非活跃
        listing.isActive = false;

        // 触发NFT上架取消事件
        emit NFTListingCancelled(_listingId);
    }

    // 普通购买NFT功能
    function buyNFT(uint256 _listingId) external {
        // 检查上架信息是否存在且处于活跃状态
        Listing storage listing = listings[_listingId];
        require(listing.isActive, "NFTMarketPermit: listing is not active");

        // 检查买家是否有足够的代币
        require(paymentToken.balanceOf(msg.sender) >= listing.price, "NFTMarketPermit: insufficient token balance");

        // 将上架信息标记为非活跃
        listing.isActive = false;

        // 处理代币转账（买家 -> 卖家）
        bool success = paymentToken.transferFrom(msg.sender, listing.seller, listing.price);
        require(success, "NFTMarketPermit: token transfer failed");

        // 处理NFT转移（卖家 -> 买家）
        IERC721(listing.nftContract).transferFrom(listing.seller, msg.sender, listing.tokenId);

        // 触发NFT售出事件
        emit NFTSold(_listingId, msg.sender, listing.seller, listing.nftContract, listing.tokenId, listing.price);
    }

    // 白名单许可购买NFT功能
    // 项目方对白名单用户签名，用户传入签名信息进行购买
    function permitBuy(uint256 _listingId, uint8 v, bytes32 r, bytes32 s) external {
        // 构造EIP-712结构体哈希
        bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, msg.sender, _listingId));

        // 计算EIP-712 digest
        bytes32 digest = MessageHashUtils.toTypedDataHash(domainSeparator, structHash);

        // 恢复签名者地址
        address recoveredSigner = ECDSA.recover(digest, v, r, s);

        // 验证签名者是否为项目方授权的signer
        require(recoveredSigner == signer, "NFTMarketPermit: invalid signature");

        // 以下为购买逻辑（与buyNFT一致）
        Listing storage listing = listings[_listingId];
        require(listing.isActive, "NFTMarketPermit: listing is not active");

        require(paymentToken.balanceOf(msg.sender) >= listing.price, "NFTMarketPermit: insufficient token balance");

        listing.isActive = false;

        bool success = paymentToken.transferFrom(msg.sender, listing.seller, listing.price);
        require(success, "NFTMarketPermit: token transfer failed");

        IERC721(listing.nftContract).transferFrom(listing.seller, msg.sender, listing.tokenId);

        emit NFTSold(_listingId, msg.sender, listing.seller, listing.nftContract, listing.tokenId, listing.price);
    }

    // 实现tokensReceived接口，处理通过transferWithCallback接收到的代币
    function tokensReceived(address from, uint256 amount, bytes calldata data) external override returns (bool) {
        // 检查调用者是否为支付代币合约
        require(msg.sender == address(paymentToken), "NFTMarketPermit: caller is not the payment token contract");

        // 解析附加数据，获取listingId
        require(data.length == 32, "NFTMarketPermit: invalid data length");
        uint256 listingId = abi.decode(data, (uint256));

        // 检查上架信息是否存在且处于活跃状态
        Listing storage listing = listings[listingId];
        require(listing.isActive, "NFTMarketPermit: listing is not active");

        // 检查转入的代币数量是否等于NFT价格
        require(amount == listing.price, "NFTMarketPermit: incorrect payment amount");

        // 将上架信息标记为非活跃
        listing.isActive = false;

        // 将代币转给卖家
        bool success = paymentToken.transfer(listing.seller, amount);
        require(success, "NFTMarketPermit: token transfer to seller failed");

        // 处理NFT转移（卖家 -> 买家）
        IERC721(listing.nftContract).transferFrom(listing.seller, from, listing.tokenId);

        // 触发NFT售出事件
        emit NFTSold(listingId, from, listing.seller, listing.nftContract, listing.tokenId, amount);

        return true;
    }

    // 辅助函数：获取购买NFT所需的回调数据
    // 买家应直接调用 paymentToken.transferWithCallbackAndData(address(market), price, getBuyData(listingId))
    function getBuyData(uint256 _listingId) external pure returns (bytes memory) {
        return abi.encode(_listingId);
    }
}

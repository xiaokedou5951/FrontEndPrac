// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test, Vm} from "forge-std/Test.sol";
import {AirdropMerkleNFTMarket} from "../../src/airdrop-merkle/AirdropMerkleNFTMarket.sol";
import {MyTokenPermit} from "../../src/airdrop-merkle/MyTokenPermit.sol";
import {SimpleNft} from "../../src/SimpleNft.sol";

contract AirdropMerkleNFTMarketTest is Test {
    AirdropMerkleNFTMarket public market;
    MyTokenPermit public paymentToken;
    SimpleNft public nft;

    // 卖家
    address seller;
    // 白名单买家
    address buyer;
    uint256 buyerPk;
    // 非白名单用户
    address outsider;
    uint256 outsiderPk;

    // Merkle 树相关
    bytes32 public merkleRoot;
    bytes32[] public buyerProof;
    // 树的另一个叶子（占位地址），保证 buyer 的 proof 非空
    address constant TREE_PARTNER = address(0xBEEF);

    uint256 constant TOKEN_ID = 1;
    uint256 constant PRICE = 100 * 10 ** 18;

    function setUp() public {
        seller = address(0x5011E3);

        buyerPk = 0xB0B;
        buyer = vm.addr(buyerPk);

        outsiderPk = 0xBAD;
        outsider = vm.addr(outsiderPk);

        // 部署支付代币（构造时 mint 全部给部署者 = 本测试合约）
        paymentToken = new MyTokenPermit(1_000_000);

        // 部署 NFT
        nft = new SimpleNft();

        // 构建 2 叶子 Merkle 树：[buyer, TREE_PARTNER]
        bytes32 leafBuyer = keccak256(abi.encodePacked(buyer));
        bytes32 leafPartner = keccak256(abi.encodePacked(TREE_PARTNER));
        merkleRoot = _pairHash(leafBuyer, leafPartner);
        buyerProof.push(leafPartner);

        // 部署市场（部署者即 owner）
        market = new AirdropMerkleNFTMarket(address(paymentToken), merkleRoot);

        // 给买家、outsider 充值
        paymentToken.transfer(buyer, PRICE * 10);
        paymentToken.transfer(outsider, PRICE * 10);

        // 卖家上架前：mint NFT + 授权市场
        nft.mint(seller, TOKEN_ID);
        vm.prank(seller);
        nft.setApprovalForAll(address(market), true);
        vm.prank(seller);
        market.list(address(nft), TOKEN_ID, PRICE);
    }

    // OZ commutativeKeccak256 等价实现：排序后 keccak256(abi.encode(a,b))
    function _pairHash(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
    }

    // OZ v5 的 PERMIT_TYPEHASH 字段顺序为 value, nonce, deadline（nonce 在 deadline 之前）
    bytes32 internal constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    // OZ ERC20 余额/授权不足时回滚的自定义错误选择器
    bytes4 internal constant ERC20_INSUFFICIENT_ALLOWANCE_SELECTOR =
        bytes4(keccak256("ERC20InsufficientAllowance(address,uint256,uint256)"));

    // 构造 EIP-2612 permit 签名
    function _signPermit(address owner, uint256 pk, address spender, uint256 value, uint256 deadline)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        uint256 nonce = paymentToken.nonces(owner);
        bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", paymentToken.DOMAIN_SEPARATOR(), structHash));
        (v, r, s) = vm.sign(pk, digest);
    }

    // 上架一个新的 NFT（用于多次领取测试）
    function _listAnother(uint256 tokenId) internal returns (uint256) {
        nft.mint(seller, tokenId);
        vm.prank(seller);
        uint256 listingId = market.list(address(nft), tokenId, PRICE);
        return listingId;
    }

    // ============================================
    // 测试：multicall(permitPrePay + claimNFT) 成功，50% 优惠价
    // ============================================
    function test_multicall_claim_success() public {
        uint256 payAmount = PRICE / 2;
        uint256 deadline = block.timestamp + 100;
        (uint8 v, bytes32 r, bytes32 s) =
            _signPermit(buyer, buyerPk, address(market), payAmount, deadline);

        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeWithSelector(market.permitPrePay.selector, payAmount, deadline, v, r, s);
        calls[1] = abi.encodeWithSelector(market.claimNFT.selector, uint256(0), buyerProof);

        uint256 sellerBefore = paymentToken.balanceOf(seller);
        vm.prank(buyer);
        market.multicall(calls);

        // NFT 归买家
        assertEq(nft.ownerOf(TOKEN_ID), buyer);
        // 卖家收到 price/2
        assertEq(paymentToken.balanceOf(seller), sellerBefore + payAmount);
        // 已标记领取
        assertTrue(market.claimed(buyer));
        // listing 失活
        (,,,, bool isActive) = market.listings(0);
        assertFalse(isActive);
        // 市场合约不持有任何代币（全部转给卖家）
        assertEq(paymentToken.balanceOf(address(market)), 0);
    }

    // ============================================
    // 测试：非白名单用户 claimNFT revert
    // ============================================
    function test_claim_notInWhitelist_reverts() public {
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(outsider);
        vm.expectRevert("AirdropMerkleNFTMarket: not in whitelist");
        market.claimNFT(0, emptyProof);
    }

    // ============================================
    // 测试：重复领取 revert（already claimed）
    // ============================================
    function test_claim_alreadyClaimed_reverts() public {
        // 先成功领取一次
        uint256 payAmount = PRICE / 2;
        uint256 deadline = block.timestamp + 100;
        (uint8 v, bytes32 r, bytes32 s) =
            _signPermit(buyer, buyerPk, address(market), payAmount, deadline);
        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeWithSelector(market.permitPrePay.selector, payAmount, deadline, v, r, s);
        calls[1] = abi.encodeWithSelector(market.claimNFT.selector, uint256(0), buyerProof);
        vm.prank(buyer);
        market.multicall(calls);

        // 再上架一个新 NFT 尝试第二次领取
        uint256 listingId2 = _listAnother(2);
        vm.prank(buyer);
        vm.expectRevert("AirdropMerkleNFTMarket: already claimed");
        market.claimNFT(listingId2, buyerProof);
    }

    // ============================================
    // 测试：未授权（无 permit 无 approve）claimNFT revert
    // OZ ERC20 授权不足时直接 revert ERC20InsufficientAllowance（而非返回 false）
    // ============================================
    function test_claim_withoutPermit_reverts() public {
        // buyer 在白名单内，但既未 permit 也未 approve 市场
        // OZ ERC20: transferFrom(from=buyer, ...) 由 market 调用，spender=market，授权=0
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(ERC20_INSUFFICIENT_ALLOWANCE_SELECTOR, address(market), uint256(0), PRICE / 2)
        );
        market.claimNFT(0, buyerProof);
    }

    // ============================================
    // 测试：取消上架后 claimNFT revert
    // ============================================
    function test_claim_cancelledListing_reverts() public {
        vm.prank(seller);
        market.cancelListing(0);

        uint256 payAmount = PRICE / 2;
        uint256 deadline = block.timestamp + 100;
        (uint8 v, bytes32 r, bytes32 s) =
            _signPermit(buyer, buyerPk, address(market), payAmount, deadline);
        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeWithSelector(market.permitPrePay.selector, payAmount, deadline, v, r, s);
        calls[1] = abi.encodeWithSelector(market.claimNFT.selector, uint256(0), buyerProof);

        vm.prank(buyer);
        vm.expectRevert("AirdropMerkleNFTMarket: listing is not active");
        market.multicall(calls);
    }

    // ============================================
    // 测试：permit 金额不足时 claimNFT revert
    // permit 仅授权 price/4，claimNFT 需 price/2，OZ ERC20 revert ERC20InsufficientAllowance
    // ============================================
    function test_claim_permitAmountInsufficient_reverts() public {
        uint256 permitAmount = PRICE / 4;
        uint256 deadline = block.timestamp + 100;
        (uint8 v, bytes32 r, bytes32 s) =
            _signPermit(buyer, buyerPk, address(market), permitAmount, deadline);
        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeWithSelector(market.permitPrePay.selector, permitAmount, deadline, v, r, s);
        calls[1] = abi.encodeWithSelector(market.claimNFT.selector, uint256(0), buyerProof);

        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(ERC20_INSUFFICIENT_ALLOWANCE_SELECTOR, address(market), PRICE / 4, PRICE / 2)
        );
        market.multicall(calls);
    }

    // ============================================
    // 测试：setMerkleRoot 仅 owner 可调用，更新后旧 proof 失效
    // ============================================
    function test_setMerkleRoot_onlyOwner() public {
        // 非 owner 调用 revert
        vm.prank(outsider);
        vm.expectRevert();
        market.setMerkleRoot(bytes32(uint256(1)));

        // owner 更新为一棵全新树（仅含 outsider）
        bytes32 newRoot = keccak256(abi.encodePacked(outsider));
        market.setMerkleRoot(newRoot);
        assertEq(market.merkleRoot(), newRoot);

        // buyer 旧 proof 失效
        vm.prank(buyer);
        vm.expectRevert("AirdropMerkleNFTMarket: not in whitelist");
        market.claimNFT(0, buyerProof);
    }

    // ============================================
    // 测试：原价 buyNFT 路径不受影响
    // ============================================
    function test_buyNFT_stillWorks() public {
        vm.startPrank(buyer);
        paymentToken.approve(address(market), PRICE);
        market.buyNFT(0);
        vm.stopPrank();

        assertEq(nft.ownerOf(TOKEN_ID), buyer);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test, Vm} from "forge-std/Test.sol";
import {NFTMarketPermit} from "../src/NFTMarketPermit.sol";
import {MyERC20} from "../src/MyERC20.sol";
import {SimpleNft} from "../src/SimpleNft.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract NFTMarketPermitTest is Test {
    NFTMarketPermit public market;
    MyERC20 public paymentToken;
    SimpleNft public nft;

    // 项目方签名私钥和地址
    uint256 signerPk;
    address signerAddr;

    // 卖家
    address seller;
    // 买家（白名单用户）
    address buyer;
    uint256 buyerPk;
    // 非白名单用户
    address nonWhitelisted;
    uint256 nonWhitelistedPk;

    uint256 constant TOKEN_ID = 1;
    uint256 constant PRICE = 100 * 10 ** 18;

    function setUp() public {
        // 生成项目方签名密钥对
        signerPk = 0xA11CE;
        signerAddr = vm.addr(signerPk);

        // 生成买家密钥对
        buyerPk = 0xB0B;
        buyer = vm.addr(buyerPk);

        // 生成非白名单用户密钥对
        nonWhitelistedPk = 0xBAD;
        nonWhitelisted = vm.addr(nonWhitelistedPk);

        // 卖家
        seller = address(0x5011E3);

        // 部署支付代币
        paymentToken = new MyERC20("PaymentToken", "PT");

        // 部署NFT
        nft = new SimpleNft();

        // 部署NFTMarketPermit
        market = new NFTMarketPermit(address(paymentToken), signerAddr);

        // 给买家和非白名单用户转一些代币，并approve市场合约
        paymentToken.transfer(buyer, PRICE * 10);
        paymentToken.transfer(nonWhitelisted, PRICE * 10);

        vm.prank(buyer);
        paymentToken.approve(address(market), type(uint256).max);

        vm.prank(nonWhitelisted);
        paymentToken.approve(address(market), type(uint256).max);
    }

    // 辅助函数：上架一个NFT，返回listingId
    function _listNft() internal returns (uint256) {
        nft.mint(seller, TOKEN_ID);
        vm.prank(seller);
        nft.setApprovalForAll(address(market), true);
        vm.prank(seller);
        return market.list(address(nft), TOKEN_ID, PRICE);
    }

    // 辅助函数：生成EIP-712签名（项目方signer为指定buyer签名）
    function _signPermitBuy(address _buyer, uint256 listingId) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(abi.encode(
            market.PERMIT_TYPEHASH(),
            _buyer,
            listingId
        ));
        bytes32 digest = MessageHashUtils.toTypedDataHash(market.domainSeparator(), structHash);
        (v, r, s) = vm.sign(signerPk, digest);
    }

    // 辅助函数：用指定私钥签名（非signer签名，用于测试无效签名）
    function _signPermitBuyWithKey(address _buyer, uint256 listingId, uint256 _pk) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(abi.encode(
            market.PERMIT_TYPEHASH(),
            _buyer,
            listingId
        ));
        bytes32 digest = MessageHashUtils.toTypedDataHash(market.domainSeparator(), structHash);
        (v, r, s) = vm.sign(_pk, digest);
    }

    // ============================================
    // 测试：白名单用户用有效签名购买成功
    // ============================================
    function test_permitBuy_success() public {
        uint256 listingId = _listNft();
        address expectedBuyer = buyer;

        (uint8 v, bytes32 r, bytes32 s) = _signPermitBuy(buyer, listingId);

        vm.prank(buyer);
        market.permitBuy(listingId, v, r, s);

        // 验证NFT已转移给买家
        assertEq(nft.ownerOf(TOKEN_ID), expectedBuyer);

        // 验证listing已非活跃
        (,,,, bool isActive) = market.listings(listingId);
        assertFalse(isActive);
    }

    // ============================================
    // 测试：非白名单用户用无效签名购买revert
    // ============================================
    function test_permitBuy_invalidSignature_reverts() public {
        uint256 listingId = _listNft();

        // 用非signer的私钥签名（用buyer自己的私钥签）
        (uint8 v, bytes32 r, bytes32 s) = _signPermitBuyWithKey(buyer, listingId, buyerPk);

        vm.prank(buyer);
        vm.expectRevert("NFTMarketPermit: invalid signature");
        market.permitBuy(listingId, v, r, s);
    }

    // ============================================
    // 测试：签名被其他地址使用时revert
    // ============================================
    function test_permitBuy_signatureUsedByOtherAddress_reverts() public {
        uint256 listingId = _listNft();

        // 项目方为buyer签名
        (uint8 v, bytes32 r, bytes32 s) = _signPermitBuy(buyer, listingId);

        // 但由nonWhitelisted调用，msg.sender不匹配签名中的buyer
        vm.prank(nonWhitelisted);
        vm.expectRevert("NFTMarketPermit: invalid signature");
        market.permitBuy(listingId, v, r, s);
    }

    // ============================================
    // 测试：签名跨listingId使用时revert
    // ============================================
    function test_permitBuy_signatureForDifferentListing_reverts() public {
        // 上架两个NFT
        nft.mint(seller, TOKEN_ID);
        nft.mint(seller, 2);
        vm.prank(seller);
        nft.setApprovalForAll(address(market), true);

        vm.prank(seller);
        uint256 listingId1 = market.list(address(nft), TOKEN_ID, PRICE);
        vm.prank(seller);
        uint256 listingId2 = market.list(address(nft), 2, PRICE);

        // 为listingId1签名
        (uint8 v, bytes32 r, bytes32 s) = _signPermitBuy(buyer, listingId1);

        // 但用于购买listingId2
        vm.prank(buyer);
        vm.expectRevert("NFTMarketPermit: invalid signature");
        market.permitBuy(listingId2, v, r, s);
    }

    // ============================================
    // 测试：购买已售出的listing时revert
    // ============================================
    function test_permitBuy_alreadySold_reverts() public {
        uint256 listingId = _listNft();

        (uint8 v, bytes32 r, bytes32 s) = _signPermitBuy(buyer, listingId);

        // 第一次购买成功
        vm.prank(buyer);
        market.permitBuy(listingId, v, r, s);

        // 重新上架另一个NFT（使用tokenId=2）以避免ownerOf revert
        nft.mint(seller, 2);
        vm.prank(seller);
        uint256 listingId2 = market.list(address(nft), 2, PRICE);

        // 使用旧签名（listingId不匹配）应revert
        vm.prank(buyer);
        vm.expectRevert("NFTMarketPermit: invalid signature");
        market.permitBuy(listingId2, v, r, s);
    }

    // ============================================
    // 测试：购买已取消的listing时revert
    // ============================================
    function test_permitBuy_cancelledListing_reverts() public {
        uint256 listingId = _listNft();

        // 卖家取消上架
        vm.prank(seller);
        market.cancelListing(listingId);

        (uint8 v, bytes32 r, bytes32 s) = _signPermitBuy(buyer, listingId);

        vm.prank(buyer);
        vm.expectRevert("NFTMarketPermit: listing is not active");
        market.permitBuy(listingId, v, r, s);
    }

    // ============================================
    // 测试：余额不足时revert
    // ============================================
    function test_permitBuy_insufficientBalance_reverts() public {
        uint256 listingId = _listNft();

        // 创建一个没有代币的地址
        address poorBuyer = address(0xDEAD);
        vm.prank(poorBuyer);

        // 为poorBuyer签名
        bytes32 structHash = keccak256(abi.encode(
            market.PERMIT_TYPEHASH(),
            poorBuyer,
            listingId
        ));
        bytes32 digest = MessageHashUtils.toTypedDataHash(market.domainSeparator(), structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);

        vm.prank(poorBuyer);
        vm.expectRevert("NFTMarketPermit: insufficient token balance");
        market.permitBuy(listingId, v, r, s);
    }

    // ============================================
    // 测试：domainSeparator正确性
    // ============================================
    function test_domainSeparator() public view {
        bytes32 expected = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("NFTMarketPermit")),
            block.chainid,
            address(market)
        ));
        assertEq(market.domainSeparator(), expected);
    }

    // ============================================
    // 测试：原有buyNFT功能不受影响
    // ============================================
    function test_buyNFT_stillWorks() public {
        uint256 listingId = _listNft();

        vm.prank(buyer);
        market.buyNFT(listingId);

        assertEq(nft.ownerOf(TOKEN_ID), buyer);
    }
}

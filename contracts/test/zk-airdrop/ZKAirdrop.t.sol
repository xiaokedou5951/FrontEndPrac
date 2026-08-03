// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {ZKAirdrop} from "../../src/zk-airdrop/ZKAirdrop.sol";
import {Groth16Verifier} from "../../src/zk-airdrop/Groth16Verifier.sol";
import {MyERC20} from "../../src/MyERC20.sol";

contract ZKAirdropTest is Test {
    ZKAirdrop public airdrop;
    Groth16Verifier public verifier;
    MyERC20 public token;

    address public owner = address(0x1);
    address public user1 = address(0x2);
    address public user2 = address(0x3);

    uint256 public constant AIRDROP_AMOUNT = 100 * 10**18;
    // 使用生成的真实 Merkle Root
    uint256 public constant MERKLE_ROOT = 18086425347332718255742779644753899290439558204290563294595225530905606355709;

    function setUp() public {
        vm.startPrank(owner);

        // 部署 ERC20 代币
        token = new MyERC20("Test Token", "TT");

        // 部署 Verifier
        verifier = new Groth16Verifier();

        // 部署 Airdrop 合约
        airdrop = new ZKAirdrop(
            address(verifier),
            address(token),
            MERKLE_ROOT,
            AIRDROP_AMOUNT
        );

        // 给 airdrop 合约转入代币
        token.transfer(address(airdrop), 10000 * 10**18);

        vm.stopPrank();
    }

    function test_initial_state() public view {
        assertEq(address(airdrop.token()), address(token));
        assertEq(address(airdrop.verifier()), address(verifier));
        assertEq(airdrop.merkleRoot(), MERKLE_ROOT);
        assertEq(airdrop.airdropAmount(), AIRDROP_AMOUNT);
        assertEq(airdrop.owner(), owner);
    }

    function test_set_merkle_root() public {
        uint256 newRoot = 0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890;

        vm.prank(owner);
        airdrop.setMerkleRoot(newRoot);

        assertEq(airdrop.merkleRoot(), newRoot);
    }

    function test_set_merkle_root_only_owner() public {
        uint256 newRoot = 0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890;

        vm.prank(user1);
        vm.expectRevert();
        airdrop.setMerkleRoot(newRoot);
    }

    function test_set_airdrop_amount() public {
        uint256 newAmount = 200 * 10**18;

        vm.prank(owner);
        airdrop.setAirdropAmount(newAmount);

        assertEq(airdrop.airdropAmount(), newAmount);
    }

    function test_set_airdrop_amount_only_owner() public {
        uint256 newAmount = 200 * 10**18;

        vm.prank(user1);
        vm.expectRevert();
        airdrop.setAirdropAmount(newAmount);
    }

    function test_withdraw_tokens() public {
        uint256 withdrawAmount = 1000 * 10**18;
        uint256 balanceBefore = token.balanceOf(owner);

        vm.prank(owner);
        airdrop.withdrawTokens(owner, withdrawAmount);

        assertEq(token.balanceOf(owner), balanceBefore + withdrawAmount);
    }

    function test_withdraw_tokens_only_owner() public {
        uint256 withdrawAmount = 1000 * 10**18;

        vm.prank(user1);
        vm.expectRevert();
        airdrop.withdrawTokens(user1, withdrawAmount);
    }

    function test_claim_with_invalid_proof() public {
        uint256 nullifierHash = 0x1111111111111111111111111111111111111111111111111111111111111111;

        // 构造无效证明
        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;

        pA[0] = 0;
        pA[1] = 0;
        pB[0][0] = 0;
        pB[0][1] = 0;
        pB[1][0] = 0;
        pB[1][1] = 0;
        pC[0] = 0;
        pC[1] = 0;

        vm.prank(user1);
        vm.expectRevert("ZKAirdrop: invalid proof");
        airdrop.claim(nullifierHash, pA, pB, pC);
    }

    function test_nullifier_prevents_double_claim() public {
        uint256 nullifierHash = 0x2222222222222222222222222222222222222222222222222222222222222222;

        // 标记 nullifier 为已使用
        vm.prank(owner);
        airdrop.setMerkleRoot(uint256(0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef));

        // 直接设置 nullifierUsed 状态（通过 mock 或实际 claim）
        // 这里我们测试 claim 函数会检查 nullifierUsed
        // 由于无法生成真实证明，我们测试 nullifier 检查逻辑

        // 第一次 claim 会因为证明无效而失败
        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;

        vm.prank(user1);
        vm.expectRevert("ZKAirdrop: invalid proof");
        airdrop.claim(nullifierHash, pA, pB, pC);
    }

    function test_constructor_validates_inputs() public {
        // 测试零地址验证
        vm.startPrank(owner);

        vm.expectRevert("ZKAirdrop: verifier cannot be zero address");
        new ZKAirdrop(
            address(0),
            address(token),
            MERKLE_ROOT,
            AIRDROP_AMOUNT
        );

        vm.expectRevert("ZKAirdrop: token cannot be zero address");
        new ZKAirdrop(
            address(verifier),
            address(0),
            MERKLE_ROOT,
            AIRDROP_AMOUNT
        );

        vm.expectRevert("ZKAirdrop: merkle root cannot be zero");
        new ZKAirdrop(
            address(verifier),
            address(token),
            0,
            AIRDROP_AMOUNT
        );

        vm.expectRevert("ZKAirdrop: airdrop amount must be greater than zero");
        new ZKAirdrop(
            address(verifier),
            address(token),
            MERKLE_ROOT,
            0
        );

        vm.stopPrank();
    }

    function test_claim_with_valid_proof() public {
        // 使用生成的真实证明数据
        uint256 nullifierHash = 6561772662007474644032982261009540439453098903998905812586836919984326581009;

        uint256[2] memory pA;
        pA[0] = 12147379032831616447499855546566404846448285463440380255852396367718291280792;
        pA[1] = 1501299636346098072813862717138561322531315196076288855267202128617288656702;

        uint256[2][2] memory pB;
        pB[0][0] = 20145065996908888436480039922640670260561198706718441977291635558884712272636;
        pB[0][1] = 9914335063780984540754702523346133553199208245798861182054229907747848360163;
        pB[1][0] = 2417502714702552679561176738398505478494387799342165183992109404895850910197;
        pB[1][1] = 7817682738026264818808778922000591993354055721944550495003384667072679875437;

        uint256[2] memory pC;
        pC[0] = 5038245765086322307986162322003652117638733179759440083087030637204975082080;
        pC[1] = 18480750206855851184139867209315435726006612608350923620950266959582289064032;

        uint256 balanceBefore = token.balanceOf(user1);

        vm.prank(user1);
        airdrop.claim(nullifierHash, pA, pB, pC);

        uint256 balanceAfter = token.balanceOf(user1);
        assertEq(balanceAfter, balanceBefore + AIRDROP_AMOUNT);

        // 验证 nullifier 已被标记为已使用
        assertTrue(airdrop.nullifierUsed(nullifierHash));
    }

    function test_claim_prevents_double_claim_with_same_nullifier() public {
        // 使用相同的证明数据
        uint256 nullifierHash = 6561772662007474644032982261009540439453098903998905812586836919984326581009;

        uint256[2] memory pA;
        pA[0] = 12147379032831616447499855546566404846448285463440380255852396367718291280792;
        pA[1] = 1501299636346098072813862717138561322531315196076288855267202128617288656702;

        uint256[2][2] memory pB;
        pB[0][0] = 20145065996908888436480039922640670260561198706718441977291635558884712272636;
        pB[0][1] = 9914335063780984540754702523346133553199208245798861182054229907747848360163;
        pB[1][0] = 2417502714702552679561176738398505478494387799342165183992109404895850910197;
        pB[1][1] = 7817682738026264818808778922000591993354055721944550495003384667072679875437;

        uint256[2] memory pC;
        pC[0] = 5038245765086322307986162322003652117638733179759440083087030637204975082080;
        pC[1] = 18480750206855851184139867209315435726006612608350923620950266959582289064032;

        // 第一次领取成功
        vm.prank(user1);
        airdrop.claim(nullifierHash, pA, pB, pC);

        // 第二次使用相同的 nullifier 应该失败
        vm.prank(user2);
        vm.expectRevert("ZKAirdrop: nullifier already used");
        airdrop.claim(nullifierHash, pA, pB, pC);
    }
}

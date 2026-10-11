# 快艇骰子

1–6 人的掷骰填表游戏，网页联机版。每回合最多掷 3 次 5 颗骰子，每次自己挑哪几颗重掷，凑出组合后必须在自己计分表的 13 个空格里挑一格填分（凑不成就填 0）。13 轮填满，总分最高的人获胜。可以加人机，一个人也能开局挑战自己的最高分。名字、美术和规则说明文字都是自己的（界面里不出现原版商标名）。

线上地址：<https://gulugagame.com/yacht/>

## 本地运行

```bash
npm install
npm run dev          # 服务端 :3022，网页 :5293（另起一套时用 SERVER_PORT / WEB_PORT 改，例如 SERVER_PORT=3122 WEB_PORT=5393）
npm test             # 规则引擎（规则书 TC1–TC15 + 各章节场景 + 1–6 人两种模式各 300 局随机对局）和服务器测试
npm run typecheck
BASE_PATH=/yacht/ npm run build
```

一个人测试：

- `node scripts/test-bot.mjs host 2 1`：机器人建一个 2 座位的房并打印房间码，你在网页里用房间码加入凑满后自动开局。`BOT_MODE=simultaneous` 建「同时掷」房。机器人用规则包里的人机策略，打完自动同意再来一局（`BOT_ONCE=1` 打完就退出）。`BOT_DELAY_MS` 调思考时间，`BOT_IDLE=1` 只挂着不动（等超时）。
- `node scripts/test-bot.mjs host 3 3`：三个机器人自己打完一整局。
- `node scripts/spy.mjs`：抓包。A、B 两个玩家加一个观战者连上真服务器，打 3 轮「同时掷」再开一局「轮流掷」，检查种子、随机数状态、动作序列有没有下发，同时掷时别人的骰子、这一轮填的格、甚至推送次数有没有漏给别人。

## 规则（自己的话）

- **计分表 13 格**。上半区：一点到六点，只数对应点数的骰子（三颗 4 点填四点格得 12）。上半区六格加起来 ≥ 63，另加 35。下半区：三条（至少 3 颗相同，得 5 颗总和）、四条（至少 4 颗相同，得 5 颗总和）、葫芦（3 颗一样 + 2 颗一样，25）、小顺（4 个连续点数，30）、大顺（5 个连续点数，40）、快艇（5 颗相同，50）、机会（无条件，5 颗总和）。
- **掷骰**：第 1 次 5 颗全掷；第 2、3 次自己挑任意几颗重掷（之前「留下」的也能重掷）。掷完第 1 次就能填分；掷满 3 次只能填分。
- **填分**：每回合必须填一个空格，每格只能用一次；不满足条件也能填，得 0（「划掉」）。大顺可以填进小顺。
- **快艇奖励和百搭**：快艇格已经填过（50 或 0）以后又掷出 5 颗相同：快艇格是 50 时这次另加 100（每次都加，没有上限）；不管是 50 还是 0，这次都要按顺序找格子填：① 对应点数的上半区格空着 → 必须填它；② 否则三条、四条有空的 → 填其中一格；③ 否则下半区任意空格（葫芦、小顺、大顺按固定分 25/30/40 算，机会按总和）；④ 都满了 → 剩下的上半区空格填 0。
- **结束**：每人填满 13 格结束，总分 = 上半区 + 35 奖励 + 下半区 + 快艇奖励。总分相同并列获胜。
- **同时掷**（开房选项，默认关）：每一轮所有人同时各掷各的、各填各的；一轮里别人的骰子和刚填的格子先不显示，只显示「已填好 / 还在掷」，全员填完一起亮出，再进下一轮。

### 默认规则表（规则书没写死、开工拍板和全站约定）

| 情况 | 现在的做法 | 出处 |
|---|---|---|
| 快艇格空着时 5 颗相同填葫芦 | 不算葫芦，得 0 | 开工拍板（§11-1） |
| 百搭顺序 | Hasbro 2016 原文：上半区 → 三条/四条 → 下半区任意（借用固定分）→ 上半区填 0 | 开工拍板（§11-4、§11-2） |
| 快艇奖励次数 | 不设上限，只在快艇格是 50 时给 | 开工拍板（§11-6） |
| 平分 | 并列获胜，名次相同 | 开工拍板（§11-3） |
| 计分表 | 只做经典计分表 | 开工拍板（§11-5） |
| 先手 | 服务器随机决定，之后按座位顺序 | 规则书 §3 |
| 人数 | 房间座位 2–6，人没坐满也能开局，1 人也行 | 规则书 §8、全站约定 |
| 第 1 次掷骰 | 必须 5 颗全掷（`reroll` 不给或给全 5 颗） | 规则书 §5-3 |
| 不带 `reroll` 的重掷 | 重掷没「留下」的那几颗；全部留下时拒绝 | 规则书 §4.1 |
| 「留下」 | `HOLD` 命令，只是标记，不算决定、不重置倒计时；重掷过的那颗自动取消留下 | 规则书 §4.1、§9.2 |
| 每步限时 | 每个决定 30 秒（掷骰、填分各算一次）。还没掷 → 自动掷；掷过 → 不再重掷，填当前得分最高的格（同分先上半区、划 0 先划一点，再固定分格，再三条/四条，最后机会；快艇格只在别无选择时划 0） | 规则书 §9.4 |
| 托管 | 连续超时 2 次转托管，由人机代打；自己动一下或点「取消托管」交还。离线的人轮到时等 3 秒再由人机代打（不算超时），用原昵称回来就交还 | 全站约定 |
| 同时掷的计时 | 每个还没填的人各自计时、各自超时；倒计时只发给自己（别人的倒计时会暴露他什么时候掷了骰） | 规则书 §9.3、§9.4 |
| 同时掷的观战 | 默认和玩家一样一轮结束才看到；房主打开「观战看全部」后看得到每个人这一轮的骰子 | 规则书 §9.6、全站观战约定 |
| 同时掷的推送 | 别人掷骰、改留下时你一条推送都收不到，发给你的 `version` 只数你看得到的变化（你自己的动作 + 全场填分次数），从推送次数和 version 都推不出别人掷了几次 | 规则书 §9.3 |
| 人机 | 房主在等待时点「加人机」（咕噜一号到五号，普通难度），移出用「移出」；人机总是同意再来一局 | 全站约定 |

## 对外接口（`packages/game`）

- `apply(state, playerId, command, rng) → { state, events }`：纯函数，不改输入，每步 `version + 1`。服务器用 `applyCommand(state, playerId, command)`（随机数接着 `state.rngState` 取）。
- 命令：`{ type: "ROLL", reroll?: number[] }`、`{ type: "HOLD", held: boolean[] }`、`{ type: "SCORE", cat }`。格子代码 `U1`–`U6`、`L3K` 三条、`L4K` 四条、`LFH` 葫芦、`LSS` 小顺、`LLS` 大顺、`LY` 快艇、`LCH` 机会（界面上的名字在 `CAT_NAMES`）。
- 计分：`rawScore(dice, cat)`、`scoreFor(dice, cat, sheet)`（含百搭借用）、`legalCategories(dice, sheet)`（含百搭强制顺序）、`isWild`、`earnsYachtBonus`、`sheetTotals(sheet) → { upper, upperBonus, lower, yachtBonus, total }`。
- 谁在动：`pendingActors(state)`（轮流模式是当前玩家，同时模式是还没填的人）、`legalActions(state, playerId)`、计时 key `actorKey(state, playerId)`。
- 超时：`timeoutCommand(state, playerId)`、`timeoutTurn(state, playerId)`、`autoScoreCategory(dice, sheet)`。
- 隐藏信息：`redactGameForViewer(state, viewerId, { seeAll? })`，观战者 viewerId 传 `""`。
- 人机：`botCommand(state, playerId)`（输入必须是 redact 过的状态）。
- **预览局面工厂**（`scenes.ts`）：
  - `buildState(options)` 按参数造任意精确局面：`players`（人数或名字，id 是 p0、p1……）、`mode`、`sheets`（每人的 `{ scores, yachtBonuses }`）、`round`、`startPlayer`、`current`、`dice`、`rolls`、`held`、同时模式的 `done` / `doneCats`、`events`、`finished`（算出结算）。
  - `makeScene(name, overrides?)` 按名字造常见局面（自己是 p0）：`start` `rolled` `held` `last-roll` `yacht` `wild-upper` `wild-kind` `wild-borrow` `wild-zero` `scratch` `bonus-near` `opponent-turn` `six-players` `solo` `simul-rolling` `simul-waiting` `simul-reveal` `timeout` `last-round` `final` `final-tie` `final-six`（列表在 `SCENE_NAMES`）。对手离线、托管这些是房间层的状态，预览页在成员列表上改 `connected` / `auto`。
  - `sampleSheet(filled, variant?)` 给一张填了 n 格的像样计分表。
  - 造出来的局面带种子，可以直接交给 `apply` 接着走；教程用按剧本出数的 Rng（`int(6)` 依次返回剧本里的点数 - 1）。

## 目录

| 路径 | 内容 |
|---|---|
| `packages/game/src/scoring.ts` | 13 格计分、百搭顺序、总分明细 |
| `packages/game/src/engine.ts` | 规则引擎、轮流 / 同时模式、超时、隐藏信息 |
| `packages/game/src/scenes.ts` | 预览局面工厂 |
| `packages/game/src/bot.ts` | 人机 |
| `packages/game/test/` | 规则测试（`rules.test.ts`）、随机对局（`random-*.test.ts`） |
| `apps/server` | Socket.IO 房间：建房、加入、玩法选择（`room:mode`）、每人一个计时器、人机和托管、观战、挤登录、管理员解散、语音信令；每局种子和动作序列写进 `logs/games.jsonl` |
| `apps/web` | 网页 |
| `art/` | 美术（美术 agent 做的规格 `spec.md`、出图脚本、定稿 `out/final/`，定稿复制在 `apps/web/public/art/`） |
| `scripts/test-bot.mjs`、`scripts/spy.mjs` | 陪玩机器人、抓包 |

## 网页

- 牌桌 `apps/web/src/GameBoard.tsx`（状态条、掷骰区、玩家条、记录、结算、聊天/菜单抽屉）+ `ScoreSheet.tsx`（计分表：灰字预览、百搭只亮合法格、填 0 弹像素确认框）；样式 `yacht.css`，白天版由 `day-palette.ts` 生成，手调在 `theme-day.css`。
- 预览页：`npm run dev` 后打开 `http://localhost:5293/preview.html?s=<场景>`，参数写在 `src/preview.tsx` 开头（规则包的 22 个局面 + 界面补的动画、等候房间、首页）。
- 截图和走查脚本在 `~/projects/qa-reports/tools/yacht/`（shoot-all.sh、analyze.mjs、play.mjs、tut-walk.mjs、tut-room.mjs）。

## 新手教程

- 剧本 `packages/game/src/tutorial.ts`（30 步：掷骰、留下、上半区和奖励、顺子、葫芦、三次都没凑成也要填、三条四条机会、快艇、又一个快艇按百搭填 +100），剧本骰子固定，`test/tutorial.test.ts` 检查从头走到尾。
- 网页：`TutorialMode.tsx` 在浏览器里直接跑规则引擎，不连服务器；共用教练层 `src/tutorial/`（从车票之旅复制，不改逻辑）；提示和小贴士 `tutorialGame.ts`。
- 入口：首页、等候房间的邀请卡，地址带 `?tutorial` 直接打开。剧本走完接着和咕噜一号打完这局。
- 「提示」（键盘 H）：练习局，以及只有自己和人机的真实对局。

## 部署

服务器上 `~/yacht`，pm2 进程 `yacht`（端口 3022），网页在 `/var/www/yacht`，Caddy `handle_path /yacht/*`（在付费网关 `@games` 里）。pm2 按仓库根目录的 `ecosystem.config.cjs` 直接启动一个 `node --import tsx` 进程跑服务端。端口和密钥存在 pm2 里，不进仓库。

## 声音

这款还没有背景音乐（`App.tsx` 用 `NO_BGM`），进了房间和教程里顶栏照样有 ♪ 面板调音效和语音。动作音效在 `apps/web/src/game-sfx.ts`（`useGameSfx`，GameBoard 和新手教程共用），按每一步的引擎事件出声，全部用 `gm-sound.tsx` 即时合成：掷骰 / 重掷 → 摇骰子声（重掷几颗落几下）；点骰子留下 / 放回 → 选中 / 取消的短音（本地马上响，别人的留下是一声轻磕）；记分 → 笔写声，划掉再加一声「过」，葫芦/顺子/快艇这些大格加得分音，上半区 +35 是大得分；掷出快艇或拿到快艇奖励 → 船笛（招牌）+ 亮晶晶的琶音；同时掷模式别人填好、一起亮出、新一轮、轮到你、交出回合、超时、终局赢/输都有提示音。自己的动作响，别人的减半；最后 5 秒倒计时每秒一声。房间里有人进出、开局、收到聊天、操作被拒绝也有提示音（`App.tsx`）。

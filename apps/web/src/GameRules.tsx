import { useState } from "react";

/** 规则说明：用自己的话写，短。等候房间里是折叠面板，牌桌上放进弹窗（modal）。 */
function RulesBody() {
  return (
    <div className="game-rules-panel" id="game-rules-panel">
      <div className="game-rules-block">
        <h3>目标</h3>
        <p>一共 13 轮。每轮掷骰凑组合，然后<b>必须</b>在自己计分表的 13 格里挑一格填分（凑不成就填 0）。填满后总分最高的人赢，同分并列。</p>
      </div>
      <div className="game-rules-block">
        <h3>掷骰</h3>
        <ul>
          <li>每轮最多掷 <b>3 次</b>：第 1 次 5 颗全掷；之后点骰子把它「留下」，只重掷其余的（留下的下次也能改主意再掷）。</li>
          <li>掷完第 1 次就能填分，不一定要掷满。</li>
        </ul>
      </div>
      <div className="game-rules-block">
        <h3>计分表</h3>
        <ul>
          <li><b>一点到六点</b>：只数对应点数的骰子（三颗 4 点填四点格得 12）。六格加起来满 <b>63</b> 另加 <b>35</b>，大约是每格三颗。</li>
          <li><b>三条 / 四条</b>：至少 3 / 4 颗相同，得 5 颗的总和。<b>机会</b>：随便什么，得总和。</li>
          <li><b>葫芦</b>（3 颗一样 + 2 颗一样）25、<b>小顺</b>（4 个连续点数）30、<b>大顺</b>（5 个连续）40、<b>快艇</b>（5 颗一样）50。大顺也能填进小顺。</li>
        </ul>
      </div>
      <div className="game-rules-block">
        <h3>再掷出快艇</h3>
        <p>快艇格填过以后又掷出 5 颗一样：快艇格是 50 就再加 <b>100</b>（次数不限）。这次要按顺序填：先填对应的点数格；满了就填三条或四条；还满就随便一格下半区（葫芦、顺子照拿固定分）；都满了就在上半区划掉一格。界面上只有能填的格子会亮。</p>
      </div>
      <div className="game-rules-block">
        <h3>其他</h3>
        <ul>
          <li>每个决定限时 30 秒：还没掷就自动掷，掷过就自动填得分最高的格。连续超时 2 次由人机托管，自己动一下就交还。</li>
          <li>「同时掷」房间：大家同时各掷各的，一轮全填完才一起亮出结果。</li>
          <li>骰子在服务器上掷。掉线后用原昵称和房间码回到自己的座位。</li>
        </ul>
      </div>
    </div>
  );
}

function GameRules({ modal = false }: { modal?: boolean }) {
  const [open, setOpen] = useState(false);
  if (modal) {
    return (
      <section className="game-rules open">
        <h2>规则说明</h2>
        <RulesBody />
      </section>
    );
  }
  return (
    <section className={open ? "game-rules open" : "game-rules"}>
      <button
        className="game-rules-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="game-rules-panel"
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">✦</span> 游戏规则
        <i aria-hidden="true">{open ? "收起 ▴" : "展开 ▾"}</i>
      </button>
      {open && <RulesBody />}
    </section>
  );
}

export default GameRules;

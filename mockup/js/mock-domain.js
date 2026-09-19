// 목업의 도메인 객체 생성 규칙. DOM 접근과 화면 전환은 호출하는 화면 행동에 맡긴다.
const MockDomain = {
  createAIMediatedMessage({ sender, originalBody, recommendations, sendChoice, recommendationIndex, messageCount }) {
    return {
      id: `MSG-${Date.now()}-${messageCount}`,
      sender,
      text: sendChoice === 'recommendation' ? recommendations[recommendationIndex] : originalBody,
      isRec: sendChoice === 'recommendation',
      aiMediation: true,
      originalBody,
      recommendationBodies: [...recommendations],
      sendChoice,
      recommendationIndex
    };
  },

  createProposal({ revision, proposer, choiceType, conditions }) {
    return {
      revision,
      proposer,
      choiceType,
      conditions: conditions.map(condition => ({ ...condition })),
      status: 'open',
      counteroffer: null
    };
  },

  createMission({ condition, proposer, accepter }) {
    return {
      id: `M-${Date.now()}`,
      title: condition.text,
      type: condition.resp === '함께' ? 'joint' : 'personal',
      performer: condition.resp === '나' ? proposer : accepter,
      confirmer: condition.resp === '나' ? accepter : proposer,
      status: 'in_progress',
      revision: 1
    };
  }
};

// 목업 전역 상태와 화면 임시 상태. 화면 렌더링·사용자 행동은 이 파일에 두지 않는다.
function createInitialMockState() {
  return {
    currentUser: 'A',
    viewStack: ['VIEW_MAIN'],
    room: {
      id: 'ROOM-01',
      status: 'active',
      inviteCode: '123456',
      messages: [
        { sender: 'B', text: '아까 약속 시간에 늦은 거 너무 서운했어.', isRec: false },
        { sender: 'A', text: '나도 갑자기 일이 생겨서 어쩔 수 없었어.', isRec: false }
      ],
      expandedMessageId: null,
      hasDrawProposal: false,
      drawProposal: null,
      negotiationHistory: [],
      reviewRequest: null,
      reviewRecords: []
    },
    missions: [{
      id: 'M-01',
      title: '오늘 저녁 산책 30분 같이 하기',
      type: 'personal',
      performer: 'A',
      confirmer: 'B',
      status: 'in_progress',
      revision: 1
    }]
  };
}

let state = createInitialMockState();

let proposerTempConditions = [];

function resetMockUiState() {
  proposerTempConditions = [
    { text: '오늘 저녁 산책 30분 같이 하기', resp: '함께' }
  ];
}

resetMockUiState();

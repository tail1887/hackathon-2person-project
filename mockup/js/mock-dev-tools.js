// 목업 검증 전용 제어부. 서비스 화면·도메인 규칙·실제 구현 계약에는 포함하지 않는다.

function setMockUser(user) {
  state.currentUser = user;
  document.getElementById('btn-user-a').classList.toggle('active', user === 'A');
  document.getElementById('btn-user-b').classList.toggle('active', user === 'B');
  document.getElementById('header-user-badge').innerText = user === 'A' ? '민준 (A)' : '서연 (B)';
  renderAll();
}

function switchMockUser(user) {
  setMockUser(user);
}

function simulateMockPartnerJoin() {
  alert('목업 테스트: 상대(서연)가 초대 코드로 입장했습니다.');
  state.room.status = 'active';
  showView('VIEW_ROOM');
}

function loadMockScenario(type) {
  if (type === 'chat_ai') {
    showView('VIEW_ROOM');
  } else if (type === 'draw_cond') {
    proposerTempConditions = [
      { text: '오늘 저녁 산책 30분 같이 하기', resp: '함께' },
      { text: '답장 늦을 때 사전에 이유 알려주기', resp: '상대' }
    ];
    submitProposal();
  } else if (type === 'draw_zero') {
    proposerTempConditions = [];
    submitProposal();
  } else if (type === 'draw_counter') {
    state.room.hasDrawProposal = false;
    state.room.drawProposal = null;
    state.room.editingCounteroffer = false;
    state.room.negotiationHistory = [];
    setMockUser('A');
    proposerTempConditions = [
      { text: '오늘 저녁 산책 30분 같이 하기', resp: '함께' },
      { text: '답장 늦을 때 사전에 이유 알려주기', resp: '상대' }
    ];
    submitProposal();
    setMockUser('B');
    showView('VIEW_NEGOTIATION');
    openCounterofferModal();
  } else if (type === 'mission') {
    showView('VIEW_MISSION_BOARD');
  } else {
    showView('VIEW_MAIN');
  }
}

function resetMockData() {
  state = createInitialMockState();
  resetMockUiState();
  setMockUser('A');
  showView('VIEW_MAIN');
}

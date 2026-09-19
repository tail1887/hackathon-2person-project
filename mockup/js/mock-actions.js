// 사용자 행동과 도메인 전이의 화면 어댑터. 순수 생성 규칙은 mock-domain.js에 둔다.



    const aiRecommendations = [
      '아까 그 말 때문에 내 마음이 조금 서운했어. 너와 솔직하게 이야기하고 싶어.',
      '우리가 서로 오해한 부분이 있는 것 같아. 천천히 정리해 볼까?'
    ];

function switchUser(user) {
      state.currentUser = user;
      document.getElementById('btn-user-a').classList.toggle('active', user === 'A');
      document.getElementById('btn-user-b').classList.toggle('active', user === 'B');
      document.getElementById('header-user-badge').innerText = user === 'A' ? '민준 (A)' : '서연 (B)';
      renderAll();
    }

function showView(viewId) {
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      const target = document.getElementById(viewId);
      if (target) target.classList.add('active');
      
      const backBtn = document.getElementById('btn-header-back');
      backBtn.style.visibility = (viewId === 'VIEW_MAIN') ? 'hidden' : 'visible';
      
      state.viewStack.push(viewId);
      renderAll();
    }

function navigateBack() {
      if (state.viewStack.length > 1) {
        state.viewStack.pop();
        const prevView = state.viewStack[state.viewStack.length - 1] || 'VIEW_MAIN';
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(prevView).classList.add('active');
        document.getElementById('btn-header-back').style.visibility = (prevView === 'VIEW_MAIN') ? 'hidden' : 'visible';
        renderAll();
      } else {
        showView('VIEW_MAIN');
      }
    }

function openSheet(sheetId) {
      document.getElementById(sheetId).classList.add('active');
    }

function closeSheet(sheetId) {
      document.getElementById(sheetId).classList.remove('active');
    }

function handleConfirmDraft() {
      const input = document.getElementById('chat-draft-input');
      const val = input.value.trim();
      if (!val) {
        alert('초안 메시지를 입력해 주세요.');
        return;
      }
      document.getElementById('ai-draft-preview').innerText = val;
      openSheet('SHEET_AI_JUDGE');
    }

function updateAISheetView() {
      const mode = document.getElementById('ai-mode-select').value;
      document.getElementById('ai-sheet-normal').style.display = (mode === 'normal') ? 'block' : 'none';
      document.getElementById('ai-sheet-restricted').style.display = (mode === 'restricted') ? 'block' : 'none';
    }

function toggleMessageDetail(messageId) {
      state.room.expandedMessageId = state.room.expandedMessageId === messageId ? null : messageId;
      renderRoom();
    }

function sendOriginalMsg() {
      const val = document.getElementById('chat-draft-input').value.trim();
      state.room.messages.push(MockDomain.createAIMediatedMessage({
        sender: state.currentUser,
        originalBody: val,
        recommendations: aiRecommendations,
        sendChoice: 'original',
        recommendationIndex: null,
        messageCount: state.room.messages.length
      }));
      document.getElementById('chat-draft-input').value = '';
      closeSheet('SHEET_AI_JUDGE');
      renderRoom();
    }

function sendRecommendedMsg(index) {
      const val = document.getElementById('chat-draft-input').value.trim();
      state.room.messages.push(MockDomain.createAIMediatedMessage({
        sender: state.currentUser,
        originalBody: val,
        recommendations: aiRecommendations,
        sendChoice: 'recommendation',
        recommendationIndex: index,
        messageCount: state.room.messages.length
      }));
      document.getElementById('chat-draft-input').value = '';
      closeSheet('SHEET_AI_JUDGE');
      renderRoom();
    }

function requestRoomReview() {
      if (state.room.reviewRequest || state.room.status === 'closed') return;
      state.room.reviewRequest = { requester: state.currentUser, status: 'pending', viewedBy: [] };
      renderAll();
    }

function requestNewRoomReview() {
      if (state.room.reviewRequest?.status !== 'ready') return;
      closeSheet('SHEET_MUNCHEOL');
      state.room.reviewRequest = { requester: state.currentUser, status: 'pending', viewedBy: [] };
      renderAll();
    }

function acceptRoomReview() {
      const review = state.room.reviewRequest;
      if (!review || review.status !== 'pending' || review.requester === state.currentUser) return;
      review.status = 'loading';
      renderAll();
      window.setTimeout(() => {
        if (state.room.reviewRequest === review && review.status === 'loading') {
          review.status = 'ready';
          review.recordId = `REVIEW-${Date.now()}`;
          state.room.reviewRecords.unshift({
            id: review.recordId,
            requester: review.requester,
            createdAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
            viewedBy: []
          });
          renderAll();
          showToast('AI 문철이 준비됐어요. 대국방의 AI 문철 확인하기를 눌러 함께 확인해 보세요.');
        }
      }, 900);
    }

function openRoomReview() {
      const review = state.room.reviewRequest;
      if (!review || review.status !== 'ready') return;
      review.viewedBy = review.viewedBy || [];
      if (!review.viewedBy.includes(state.currentUser)) review.viewedBy.push(state.currentUser);
      const record = state.room.reviewRecords.find(item => item.id === review.recordId);
      if (record) {
        record.viewedBy = record.viewedBy || [];
        if (!record.viewedBy.includes(state.currentUser)) record.viewedBy.push(state.currentUser);
      }
      renderAll();
      openReviewRecord(review.recordId, true);
    }

function openReviewHistory() {
      const list = document.getElementById('review-history-list');
      const currentReviewRecordId = state.room.reviewRequest?.status === 'ready'
        ? state.room.reviewRequest.recordId
        : null;
      const previousRecords = state.room.reviewRecords.filter(record => record.id !== currentReviewRecordId);
      list.innerHTML = previousRecords.map((record, index) => {
        const requester = record.requester === 'A' ? '민준' : '서연';
        return `<div class="card"><div class="card-title">이전 문철 ${previousRecords.length - index}</div><div class="card-sub">${requester} 신청 · ${record.createdAt} · 읽기 전용</div><button class="btn btn-sm btn-outline" style="margin-top: 10px;" onclick="openReviewRecord('${record.id}', false)">이 문철 보기</button></div>`;
      }).join('');
      openSheet('SHEET_MUNCHEOL_HISTORY');
    }

function openReviewRecord(recordId, isCurrent) {
      const record = state.room.reviewRecords.find(item => item.id === recordId);
      if (!record) return;
      closeSheet('SHEET_MUNCHEOL_HISTORY');
      const order = state.room.reviewRecords.findIndex(item => item.id === recordId);
      document.getElementById('review-result-context').innerText = isCurrent
        ? `현재 문철 · ${record.createdAt} · 현재 문철 아래에서 새 신청을 시작할 수 있어요.`
        : `문철 기록 ${state.room.reviewRecords.length - order} · ${record.createdAt} · 읽기 전용`;
      openSheet('SHEET_MUNCHEOL');
    }

function showToast(message) {
      document.getElementById('mockup-toast')?.remove();
      const toast = document.createElement('div');
      toast.id = 'mockup-toast';
      toast.className = 'toast';
      toast.setAttribute('role', 'status');
      toast.innerText = message;
      document.body.append(toast);
      window.setTimeout(() => toast.remove(), 3600);
    }

function openNegotiationFromRoom() {
      if (!state.room.hasDrawProposal) {
        state.room.drawProposal = null;
        state.room.editingCounteroffer = false;
        proposerTempConditions = [
          { text: '오늘 저녁 산책 30분 같이 하기', resp: '함께' },
          { text: '서로 감사했던 일 한 가지씩 표현하기', resp: '상대' }
        ];
      }
      showView('VIEW_NEGOTIATION');
    }

function addProposerCondition() {
      proposerTempConditions.push({ text: '새로운 약속 실행하기', resp: '함께' });
      renderProposerForm();
    }

function removeProposerCondition(i) {
      proposerTempConditions.splice(i, 1);
      renderProposerForm();
    }

function clearProposerConditions() {
      proposerTempConditions = [];
      renderProposerForm();
    }

function submitProposal() {
      if (state.room.hasDrawProposal && !state.room.editingCounteroffer) {
        alert('상대 응답 전에는 보낸 제안을 수정하거나 재발송할 수 없습니다.');
        return;
      }
      const choiceType = document.querySelector('input[name="neg-choice-type"]:checked').value;
      const previousProposal = state.room.drawProposal;
      if (!previousProposal) state.room.negotiationHistory = [];
      const revision = previousProposal ? previousProposal.revision + 1 : 1;
      const proposal = MockDomain.createProposal({
        revision,
        proposer: state.currentUser,
        choiceType,
        conditions: proposerTempConditions
      });
      state.room.hasDrawProposal = true;
      state.room.drawProposal = proposal;
      state.room.editingCounteroffer = false;
      state.room.negotiationHistory.push({ type: 'proposal', proposal: { ...proposal, conditions: proposal.conditions.map(condition => ({ ...condition })) } });
      alert('무승부 제안이 전달되었습니다. 상대방 시점으로 전환해 수락할 수 있습니다.');
      showView('VIEW_ROOM');
    }

function beginCounterofferRevision() {
      const prop = state.room.drawProposal;
      if (!prop || !prop.counteroffer || prop.proposer !== state.currentUser) return;
      proposerTempConditions = prop.conditions.map(condition => ({ ...condition }));
      document.querySelector(`input[name="neg-choice-type"][value="${prop.choiceType}"]`).checked = true;
      state.room.editingCounteroffer = true;
      renderAll();
    }

function acceptNegotiation() {
      const prop = state.room.drawProposal;
      if (!prop || prop.status !== 'open' || prop.proposer === state.currentUser) return;
      
      // If has conditions, extract selected
      if (prop.conditions && prop.conditions.length > 0) {
        const selected = document.querySelectorAll('input[name="resp-select"]:checked');
        if (selected.length === 0) {
          alert('수락할 조건을 하나 이상 선택해 주세요.');
          return;
        }
        selected.forEach(el => {
          const idx = parseInt(el.value);
          const cond = prop.conditions[idx];
          state.missions.push(MockDomain.createMission({
            condition: cond,
            proposer: prop.proposer,
            accepter: state.currentUser
          }));
        });
      }

      // Close Room and archive
      state.room.negotiationHistory.push({ type: 'accepted', revision: prop.revision, accepter: state.currentUser });
      state.room.status = 'closed';
      state.room.hasDrawProposal = false;
      state.room.drawProposal = null;
      state.room.editingCounteroffer = false;
      alert('무승부 협상이 성립되어 대국이 종료되었으며 선택된 조건이 미션으로 생성되었습니다.');
      showView('VIEW_MAIN');
    }

function openCounterofferModal() {
      const prop = state.room.drawProposal;
      if (!prop || prop.status !== 'open' || prop.proposer === state.currentUser) return;
      openSheet('SHEET_COUNTEROFFER');
    }

function sendCounteroffer() {
      const val = document.getElementById('counteroffer-msg-input').value.trim();
      if (!val) {
        alert('카운터오퍼 내용을 입력해 주세요.');
        return;
      }
      const prop = state.room.drawProposal;
      if (!prop || prop.status !== 'open' || prop.proposer === state.currentUser) return;
      prop.status = 'counter_requested';
      prop.counteroffer = { author: state.currentUser, body: val };
      state.room.negotiationHistory.push({ type: 'counteroffer', revision: prop.revision, author: state.currentUser, body: val });
      closeSheet('SHEET_COUNTEROFFER');
      document.getElementById('counteroffer-msg-input').value = '';
      showView('VIEW_ROOM');
    }

function cancelNegotiation() {
      const prop = state.room.drawProposal;
      if (!prop || prop.status !== 'open') return;
      state.room.negotiationHistory.push({ type: 'cancelled', revision: prop.revision, actor: state.currentUser });
      state.room.hasDrawProposal = false;
      state.room.drawProposal = null;
      state.room.editingCounteroffer = false;
      alert('무승부 협상을 종료하고 대국을 계속합니다.');
      showView('VIEW_ROOM');
    }

function openNegotiationHistory() {
      renderNegotiationHistory();
      openSheet('SHEET_NEGOTIATION_HISTORY');
    }

function updateMissionStatus(id, newStatus) {
      const m = state.missions.find(x => x.id === id);
      if (!m) return;

      if (m.type === 'joint' && newStatus === 'joint_checkin') {
        const participants = m.participants || [];
        if (!participants.includes(state.currentUser)) return;
        m.completedBy = m.completedBy || [];
        if (!m.completedBy.includes(state.currentUser)) m.completedBy.push(state.currentUser);
        if (participants.every(user => m.completedBy.includes(user))) m.status = 'completed';
        renderAll();
        return;
      }

      m.status = newStatus;
      renderAll();
    }

function createRoomAsA() {
      switchUser('A');
      showView('VIEW_INVITE_WAIT');
    }

function simulateBJoin() {
      alert('상대(서연)가 초대 코드로 입장했습니다!');
      state.room.status = 'active';
      showView('VIEW_ROOM');
    }

function joinRoomWithCode() {
      const code = document.getElementById('input-invite-code').value.trim();
      if (code !== '123456') {
        alert('유효하지 않은 초대 코드입니다.');
        return;
      }
      switchUser('B');
      state.room.status = 'active';
      alert('대국방에 성공적으로 입장했습니다.');
      showView('VIEW_ROOM');
    }

function loadScenario(type) {
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
        state.currentUser = 'A';
        proposerTempConditions = [
          { text: '오늘 저녁 산책 30분 같이 하기', resp: '함께' },
          { text: '답장 늦을 때 사전에 이유 알려주기', resp: '상대' }
        ];
        submitProposal();
        switchUser('B');
        showView('VIEW_NEGOTIATION');
        openCounterofferModal();
      } else if (type === 'mission') {
        showView('VIEW_MISSION_BOARD');
      } else {
        showView('VIEW_MAIN');
      }
    }

function resetAllData() {
      state = createInitialMockState();
      resetMockUiState();
      switchUser('A');
      showView('VIEW_MAIN');
    }

// 목업 초기 화면
renderAll();

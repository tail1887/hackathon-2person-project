// 화면 렌더링 전용 모듈. 상태 변경은 사용자 행동 모듈에서 수행한다.

function renderAll() {
      renderMain();
      renderRoom();
      renderNegotiation();
      renderNegotiationHistory();
      renderMissions();
    }

function renderMain() {
      // Missions
      const mContainer = document.getElementById('main-mission-container');
      if (state.missions.length === 0) {
        mContainer.innerHTML = `<div class="card card-sub" style="text-align:center;">진행 중인 미션이 없습니다.</div>`;
      } else {
        mContainer.innerHTML = state.missions.map(m => {
          let badgeTag = '';
          if (m.status === 'requested') badgeTag = `<span class="tag tag-pending">상대 확인 대기</span>`;
          else if (m.status === 'in_progress') badgeTag = `<span class="tag tag-active">진행 중</span>`;
          else if (m.status === 'completed') badgeTag = `<span class="tag tag-closed">완료됨</span>`;
          
          return `
            <div class="card" onclick="showView('VIEW_MISSION_BOARD')" style="cursor:pointer;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div class="card-title" style="margin-bottom:0;">${m.title}</div>
                ${badgeTag}
              </div>
              <div class="card-sub" style="margin-top:4px;">수행자: ${m.performer === 'A' ? '민준' : '서연'} | 확인자: ${m.confirmer === 'A' ? '민준' : '서연'}</div>
            </div>
          `;
        }).join('');
      }

      // Active Game
      const activeContainer = document.getElementById('main-active-game-container');
      if (state.room.status === 'active') {
        const oppName = state.currentUser === 'A' ? '서연 (B)' : '민준 (A)';
        activeContainer.innerHTML = `
          <div class="card" style="border-left: 4px solid var(--primary);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <span class="tag tag-active">진행 중 대국</span>
                <div class="card-title" style="margin-top:4px;">상대: ${oppName}</div>
              </div>
              <button class="btn btn-sm btn-primary" onclick="showView('VIEW_ROOM')">대국 재개</button>
            </div>
          </div>
        `;
      } else {
        activeContainer.innerHTML = `<div class="card card-sub" style="text-align:center;">진행 중인 대국이 없습니다.</div>`;
      }

      // Past Games
      const pastContainer = document.getElementById('main-past-games-container');
      if (state.room.status === 'closed') {
        const oppName = state.currentUser === 'A' ? '서연 (B)' : '민준 (A)';
        pastContainer.innerHTML = `
          <div class="card" style="background:#fafafa;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <span class="tag tag-closed">종료됨 (읽기 전용)</span>
                <div class="card-title" style="margin-top:4px;">대국 상대: ${oppName}</div>
              </div>
              <button class="btn btn-sm btn-secondary" onclick="showView('VIEW_ROOM')">대국 기록 보기</button>
            </div>
          </div>
        `;
      } else {
        pastContainer.innerHTML = '';
      }
    }

function renderRoom() {
      const oppName = state.currentUser === 'A' ? '서연' : '민준';
      document.getElementById('room-opponent-name').innerText = oppName;

      const isClosed = state.room.status === 'closed';
      document.getElementById('room-status-tag').className = isClosed ? 'tag tag-closed' : 'tag tag-active';
      document.getElementById('room-status-tag').innerText = isClosed ? '종료됨' : '진행 중';

      document.getElementById('chat-bottom-panel').style.display = isClosed ? 'none' : 'flex';
      document.getElementById('room-closed-banner').style.display = isClosed ? 'block' : 'none';
      document.getElementById('btn-negotiation-history').style.display = state.room.negotiationHistory.length ? 'inline-flex' : 'none';
      const sharedReviewRecords = state.room.reviewRecords.filter(record => record.viewedBy?.length === 2);
      const closedReviewRecords = document.getElementById('room-closed-review-records');
      closedReviewRecords.style.display = isClosed && sharedReviewRecords.length ? 'block' : 'none';
      document.getElementById('room-closed-review-record-list').innerHTML = sharedReviewRecords.map((record, index) => {
        const requester = record.requester === 'A' ? '민준' : '서연';
        return `<div class="card"><div class="card-title">함께 확인한 문철 ${sharedReviewRecords.length - index}</div><div class="card-sub">${requester} 신청 · ${record.createdAt} · 읽기 전용</div><button class="btn btn-sm btn-outline" style="margin-top:10px;" onclick="openReviewRecord('${record.id}', false)">문철 보기</button></div>`;
      }).join('');

      // Draw Banner
      const banner = document.getElementById('room-draw-banner');
      if (state.room.hasDrawProposal && !isClosed) {
        banner.style.display = 'block';
        const isProposer = state.room.drawProposal.proposer === state.currentUser;
        const hasCounteroffer = Boolean(state.room.drawProposal.counteroffer);
        document.getElementById('draw-banner-text').innerText = isProposer
          ? (hasCounteroffer ? '카운터오퍼가 도착했습니다. 제안을 수정할 수 있습니다.' : '상대방의 수락/카운터오퍼 대기 중')
          : (hasCounteroffer ? '카운터오퍼를 보냈습니다. 상대의 수정 제안을 기다리고 있어요.' : '상대방의 무승부 제안이 도착했습니다.');
      } else {
        banner.style.display = 'none';
      }

      // AI 문철은 신청자·상대의 명시적 동의 뒤에만 생성한다.
      const review = state.room.reviewRequest;
      const reviewBanner = document.getElementById('room-review-banner');
      const reviewText = document.getElementById('room-review-banner-text');
      const reviewBannerBtn = document.getElementById('btn-room-review-banner');
      const reviewBtn = document.getElementById('btn-room-review');
      const reviewHistoryBtn = document.getElementById('btn-review-history-in-sheet');
      reviewBanner.style.display = 'none';
      reviewBannerBtn.style.display = 'none';
      reviewHistoryBtn.style.display = state.room.reviewRecords.length ? 'inline-flex' : 'none';
      reviewBtn.disabled = false;
      reviewBtn.onclick = requestRoomReview;
      reviewBtn.innerText = '⚖️ AI 문철 신청하기';

      if (review && !isClosed) {
        reviewBanner.style.display = 'block';
        if (review.status === 'pending') {
          if (review.requester === state.currentUser) {
            reviewText.innerText = 'AI 문철 신청을 보냈어요. 상대의 수락을 기다리고 있어요.';
          } else {
            const requesterName = review.requester === 'A' ? '민준' : '서연';
            reviewText.innerText = `${requesterName}님이 AI 문철을 신청했습니다. 함께 대화를 정리해 볼까요?`;
            reviewBannerBtn.innerText = '동의하고 시작';
            reviewBannerBtn.style.display = 'inline-flex';
            reviewBannerBtn.onclick = acceptRoomReview;
          }
          reviewBtn.disabled = true;
          reviewBtn.innerText = '⚖️ AI 문철 수락 대기 중';
        } else if (review.status === 'loading') {
          reviewText.innerText = 'AI 문철을 준비하고 있어요. 두 사람의 대화를 함께 정리하는 중이에요.';
          reviewBtn.disabled = true;
          reviewBtn.innerText = '⚖️ AI 문철 준비 중';
        } else if (review.status === 'ready') {
          const hasViewedCurrentReview = review.viewedBy?.includes(state.currentUser);
          reviewBanner.style.display = hasViewedCurrentReview ? 'none' : 'block';
          if (!hasViewedCurrentReview) {
            reviewText.innerText = 'AI 문철이 준비됐어요. 두 사람이 함께 확인할 수 있어요.';
            reviewBannerBtn.innerText = '함께 확인하기';
            reviewBannerBtn.style.display = 'inline-flex';
            reviewBannerBtn.onclick = openRoomReview;
          }
          reviewBtn.innerText = '⚖️ AI 문철 확인하기';
          reviewBtn.onclick = openRoomReview;
        }
      }

      // Messages
      const container = document.getElementById('chat-messages');
      container.innerHTML = state.room.messages.map((m, index) => {
        const isMe = m.sender === state.currentUser;
        const senderName = m.sender === 'A' ? '민준' : '서연';
        const messageId = m.id || `initial-${index}`;
        const canOpenPrivateDetail = isMe && m.aiMediation;
        const isExpanded = state.room.expandedMessageId === messageId;
        const privateDetail = isExpanded ? `
          <div class="msg-private-detail">
            <div class="msg-private-detail-item"><span class="msg-private-detail-label">내 원문</span>${escapeHtml(m.originalBody)}</div>
            <div class="msg-private-detail-item"><span class="msg-private-detail-label">AI 추천문</span>${m.recommendationBodies.map((body, recommendationIndex) => `${recommendationIndex + 1}. ${escapeHtml(body)}`).join('<br>')}</div>
            <div class="msg-private-detail-item"><span class="msg-private-detail-label">실제 전송</span>${m.sendChoice === 'recommendation' ? `AI 추천문 ${m.recommendationIndex + 1}` : '원문'}</div>
          </div>
        ` : '';
        return `
          <div class="msg-bubble ${isMe ? 'msg-right' : 'msg-left'} ${m.isRec ? 'msg-recommended' : ''} ${canOpenPrivateDetail ? 'msg-detail-trigger' : ''}" ${canOpenPrivateDetail ? `role="button" tabindex="0" onclick="toggleMessageDetail('${messageId}')" onkeydown="if(event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleMessageDetail('${messageId}'); }"` : ''}>
            <div class="msg-sender">${senderName} ${m.isRec ? '<span class="msg-badge">AI 추천</span>' : ''}</div>
            ${escapeHtml(m.text)}
            ${canOpenPrivateDetail ? `<span class="msg-detail-hint">${isExpanded ? '클릭해 상세 접기' : '클릭해 내 원문과 AI 추천문 보기'}</span>` : ''}
            ${privateDetail}
          </div>
        `;
      }).join('');
      container.scrollTop = container.scrollHeight;
    }

function renderNegotiation() {
      const pView = document.getElementById('negotiation-proposer-view');
      const pStatusView = document.getElementById('negotiation-proposer-status-view');
      const rView = document.getElementById('negotiation-responder-view');
      const rStatusView = document.getElementById('negotiation-responder-status-view');

      if (!state.room.hasDrawProposal) {
        pView.style.display = 'block';
        pStatusView.style.display = 'none';
        rView.style.display = 'none';
        rStatusView.style.display = 'none';
        renderProposerForm();
      } else {
        const isProposer = state.room.drawProposal.proposer === state.currentUser;
        if (isProposer) {
          if (state.room.editingCounteroffer) {
            pView.style.display = 'block';
            pStatusView.style.display = 'none';
            renderProposerForm();
          } else {
            pView.style.display = 'none';
            pStatusView.style.display = 'block';
            renderProposerStatus();
          }
          rView.style.display = 'none';
          rStatusView.style.display = 'none';
        } else {
          pView.style.display = 'none';
          pStatusView.style.display = 'none';
          if (state.room.drawProposal.status === 'counter_requested') {
            rView.style.display = 'none';
            rStatusView.style.display = 'block';
            renderResponderStatus();
          } else {
            rView.style.display = 'block';
            rStatusView.style.display = 'none';
            renderResponderForm();
          }
        }
      }
    }

function renderProposerStatus() {
      const prop = state.room.drawProposal;
      const hasCounteroffer = Boolean(prop.counteroffer);
      document.getElementById('proposer-status-description').innerText = hasCounteroffer
        ? '상대의 카운터오퍼를 확인했습니다. 아래 요청을 참고해 새 제안을 작성할 수 있습니다.'
        : '상대가 수락·계속 대국·카운터오퍼 중 하나로 응답할 때까지 수정하거나 재발송할 수 없습니다.';
      document.getElementById('proposer-status-tag').innerText = hasCounteroffer ? '카운터오퍼 도착' : '상대 응답 대기';
      document.getElementById('proposer-status-conditions').innerHTML = renderReadOnlyConditions(prop.conditions);
      const counterBox = document.getElementById('proposer-counteroffer-box');
      counterBox.style.display = hasCounteroffer ? 'block' : 'none';
      if (hasCounteroffer) {
        const name = prop.counteroffer.author === 'A' ? '민준' : '서연';
        counterBox.innerHTML = `<div class="notice-box"><strong>${name}의 카운터오퍼</strong><br>${escapeHtml(prop.counteroffer.body)}</div>`;
      }
      document.getElementById('btn-edit-counteroffer').style.display = hasCounteroffer ? 'inline-flex' : 'none';
      document.getElementById('btn-proposer-cancel').style.display = hasCounteroffer ? 'none' : 'inline-flex';
    }

function renderResponderStatus() {
      const counteroffer = state.room.drawProposal.counteroffer;
      document.getElementById('responder-status-counteroffer').innerHTML = `
        <div class="notice-box"><strong>내 카운터오퍼</strong><br>${escapeHtml(counteroffer.body)}</div>
      `;
    }

function renderReadOnlyConditions(conditions) {
      if (!conditions || conditions.length === 0) {
        return `<div class="notice-box">조건 없이 합의하는 제안입니다. 수락하면 미션 없이 대국이 종료됩니다.</div>`;
      }
      return conditions.map((condition, index) => `
        <div class="condition-item">
          <strong>조건 ${index + 1}</strong> · ${escapeHtml(condition.text)}
          <div style="font-size:0.78rem; color:var(--text-muted); margin-top:4px;">책임 주체: ${condition.resp}</div>
        </div>
      `).join('');
    }

function escapeHtml(value) {
      const element = document.createElement('div');
      element.innerText = value || '';
      return element.innerHTML;
    }

function renderProposerForm() {
      const container = document.getElementById('proposer-conditions-container');
      if (proposerTempConditions.length === 0) {
        container.innerHTML = `<div class="warning-box">합의 조건이 0개입니다. 수락 시 미션 없이 대국이 종료됩니다.</div>`;
      } else {
        container.innerHTML = proposerTempConditions.map((c, i) => `
          <div class="condition-item">
            <div class="form-group" style="margin-bottom:6px;">
              <input type="text" class="form-control" value="${c.text}" onchange="proposerTempConditions[${i}].text=this.value">
            </div>
            <div style="font-size:0.8rem; display:flex; gap:10px; align-items:center;">
              <span>책임:</span>
              <label><input type="radio" name="resp-${i}" value="나" ${c.resp==='나'?'checked':''} onchange="proposerTempConditions[${i}].resp='나'"> 나</label>
              <label><input type="radio" name="resp-${i}" value="상대" ${c.resp==='상대'?'checked':''} onchange="proposerTempConditions[${i}].resp='상대'"> 상대</label>
              <label><input type="radio" name="resp-${i}" value="함께" ${c.resp==='함께'?'checked':''} onchange="proposerTempConditions[${i}].resp='함께'"> 함께</label>
              <button class="btn btn-sm btn-danger" style="margin-left:auto; padding:2px 6px;" onclick="removeProposerCondition(${i})">삭제</button>
            </div>
          </div>
        `).join('');
      }
    }

function renderResponderForm() {
      const prop = state.room.drawProposal;
      const box = document.getElementById('responder-conditions-box');
      const btnAccept = document.getElementById('btn-responder-accept');

      if (!prop.conditions || prop.conditions.length === 0) {
        box.innerHTML = `
          <div class="notice-box">
            🤝 <strong>조건 0개 제안:</strong> 합의할 조건이 없습니다. 수락하면 미션 작성 없이 대국방이 종료됩니다.
          </div>
        `;
        btnAccept.innerText = '조건 없이 수락하기';
      } else {
        const inputType = prop.choiceType === 'single' ? 'radio' : 'checkbox';
        box.innerHTML = prop.conditions.map((c, i) => `
          <div class="condition-item">
            <label class="checkbox-label" style="font-weight:600;">
              <input type="${inputType}" name="resp-select" value="${i}">
              ${c.text}
            </label>
            <div style="font-size:0.78rem; color:var(--text-muted); margin-top:4px; padding-left:22px;">
              책임 주체: ${c.resp}
            </div>
          </div>
        `).join('');
        btnAccept.innerText = '선택 후 수락하기';
      }
    }

function renderNegotiationHistory() {
      const container = document.getElementById('negotiation-history-list');
      if (!state.room.negotiationHistory.length) {
        container.innerHTML = `<div class="card card-sub" style="text-align:center;">아직 남은 무승부 협상 기록이 없습니다.</div>`;
        return;
      }
      container.innerHTML = state.room.negotiationHistory.map(entry => {
        if (entry.type === 'proposal') {
          const name = entry.proposal.proposer === 'A' ? '민준' : '서연';
          return `<div class="card"><div class="card-title">제안 v${entry.proposal.revision} · ${name}</div>${renderReadOnlyConditions(entry.proposal.conditions)}</div>`;
        }
        if (entry.type === 'counteroffer') {
          const name = entry.author === 'A' ? '민준' : '서연';
          return `<div class="card" style="border-left:4px solid var(--warning);"><div class="card-title">카운터오퍼 · ${name}</div><div class="card-sub">${escapeHtml(entry.body)}</div></div>`;
        }
        if (entry.type === 'accepted') return `<div class="notice-box">제안 v${entry.revision} 수락 · 무승부 합의</div>`;
        return `<div class="warning-box">제안 v${entry.revision} 종료 · 계속 대국</div>`;
      }).join('');
    }

function renderMissions() {
      const container = document.getElementById('mission-board-list');
      if (state.missions.length === 0) {
        container.innerHTML = `<div class="card card-sub" style="text-align:center;">생성된 미션이 없습니다.</div>`;
        return;
      }

      container.innerHTML = state.missions.map(m => {
        const isPerformer = m.performer === state.currentUser;
        const isConfirmer = m.confirmer === state.currentUser;

        let actions = '';
        if (m.status === 'in_progress') {
          if (isPerformer) {
            actions = `<button class="btn btn-sm btn-primary" onclick="updateMissionStatus('${m.id}', 'requested')">완료 요청</button>`;
          } else {
            actions = `<span class="tag tag-active">수행자 진행 중</span>`;
          }
        } else if (m.status === 'requested') {
          if (isConfirmer) {
            actions = `
              <button class="btn btn-sm btn-success" onclick="updateMissionStatus('${m.id}', 'completed')">수행 확인</button>
              <button class="btn btn-sm btn-danger" onclick="updateMissionStatus('${m.id}', 'retry')">다시 요청</button>
            `;
          } else {
            actions = `<span class="tag tag-pending">상대 확인 대기</span>`;
          }
        } else if (m.status === 'completed') {
          actions = `<span class="tag tag-closed">완료됨</span>`;
        } else if (m.status === 'retry') {
          if (isPerformer) {
            actions = `<button class="btn btn-sm btn-primary" onclick="updateMissionStatus('${m.id}', 'in_progress')">재수행 시작</button>`;
          } else {
            actions = `<span class="tag tag-pending">재수행 대기</span>`;
          }
        }

        return `
          <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
              <div class="card-title">${m.title}</div>
              <span class="tag tag-active">${m.type === 'joint' ? '공동 퀘스트' : '개인 미션'}</span>
            </div>
            <div class="card-sub" style="margin-bottom:10px;">
              수행자: ${m.performer === 'A' ? '민준' : '서연'} | 확인자: ${m.confirmer === 'A' ? '민준' : '서연'}
            </div>
            <div style="display:flex; justify-content:flex-end; gap:6px;">
              ${actions}
            </div>
          </div>
        `;
      }).join('');
    }

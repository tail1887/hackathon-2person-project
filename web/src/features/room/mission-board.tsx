"use client";

import { useMemo, useState } from "react";

export type Mission = {
  id: string;
  room_id: string;
  current_revision: number;
  kind: "individual" | "joint";
  owner_member_key: string | null;
  text: string;
  due_date: string | null;
  status:
    | "in_progress"
    | "completion_requested"
    | "revision_requested"
    | "completed"
    | "abandoned";
};

export type MissionParticipant = {
  mission_id: string;
  public_member_key: string;
};
export type MissionAction = {
  id: string;
  mission_id: string;
  revision: number;
  actor_member_key: string;
  type: string;
  note: string | null;
  created_at: string;
};
export type MissionChangeOffer = {
  id: string;
  mission_id: string;
  base_revision: number;
  proposer_member_key: string;
  proposed_text: string;
  proposed_due_date: string | null;
  proposed_kind: "individual" | "joint";
  proposed_owner_member_key: string | null;
  status: "open" | "accepted" | "rejected" | "cancelled" | "stale";
  created_at: string;
};
export type MissionRevision = {
  mission_id: string;
  revision: number;
  text: string;
  due_date: string | null;
  kind: "individual" | "joint";
  owner_member_key: string | null;
  applied_at: string;
};

type MemberOption = { public_member_key: string; room_display_name: string };
type Props = {
  missions: Mission[];
  participants: MissionParticipant[];
  actions: MissionAction[];
  changeOffers: MissionChangeOffer[];
  revisions: MissionRevision[];
  members: MemberOption[];
  myMemberKey?: string;
  working: boolean;
  error?: string;
  onAction: (
    missionId: string,
    action:
      | "complete_request"
      | "confirm"
      | "request_revision"
      | "resume"
      | "abandon"
      | "joint_checkin",
  ) => void;
  onCreateChange: (
    missionId: string,
    text: string,
    kind: "individual" | "joint",
    ownerMemberKey: string | null,
  ) => void;
  onResolveChange: (
    changeOfferId: string,
    resolution: "accept" | "reject" | "cancel",
  ) => void;
};

const statusLabel: Record<Mission["status"], string> = {
  in_progress: "진행 중",
  completion_requested: "상대 확인 대기",
  revision_requested: "재수행 요청됨",
  completed: "완료",
  abandoned: "포기됨",
};
function memberName(key: string | null, members: MemberOption[]) {
  return (
    members.find((member) => member.public_member_key === key)
      ?.room_display_name ?? "상대"
  );
}

function dateLabel(value: string | null) {
  if (!value) return "기한 없음";
  return `${value.replaceAll("-", ".")}까지`;
}

export function MissionBoard({
  missions,
  participants,
  actions,
  changeOffers,
  revisions,
  members,
  myMemberKey,
  working,
  error,
  onAction,
  onCreateChange,
  onResolveChange,
}: Props) {
  const [selectedId, setSelectedId] = useState<string>();
  const [editing, setEditing] = useState(false);
  const selected = useMemo(
    () => missions.find((mission) => mission.id === selectedId) ?? missions[0],
    [missions, selectedId],
  );
  const [draftText, setDraftText] = useState("");
  const [draftKind, setDraftKind] = useState<"individual" | "joint">(
    "individual",
  );
  const [draftOwner, setDraftOwner] = useState<string>("");

  function beginEdit(mission: Mission) {
    setDraftText(mission.text);
    setDraftKind(mission.kind);
    setDraftOwner(mission.owner_member_key ?? myMemberKey ?? "");
    setEditing(true);
  }

  if (!selected)
    return (
      <section className="mission-board">
        <h1 className="section-title">📌 미션 보드</h1>
        <article className="card empty-card">
          <p>아직 진행할 미션이 없습니다.</p>
          <p className="hint">
            무승부 제안의 조건을 수락하면 선택된 조건만 미션으로 생성됩니다.
          </p>
        </article>
      </section>
    );

  const isOwner = selected.owner_member_key === myMemberKey;
  const isParticipant = participants.some(
    (participant) =>
      participant.mission_id === selected.id &&
      participant.public_member_key === myMemberKey,
  );
  const currentActions = actions.filter(
    (action) =>
      action.mission_id === selected.id &&
      action.revision === selected.current_revision,
  );
  const checkedIn = currentActions.some(
    (action) =>
      action.type === "joint_checkin" &&
      action.actor_member_key === myMemberKey,
  );
  const openOffer = changeOffers.find(
    (offer) => offer.mission_id === selected.id && offer.status === "open",
  );
  const selectedRevisions = revisions
    .filter((revision) => revision.mission_id === selected.id)
    .sort((a, b) => b.revision - a.revision);

  return (
    <section className="mission-board">
      <h1 className="section-title">📌 미션 보드</h1>
      <article className="card mission-guide">
        <p>
          💡 미션은 양측 수락 뒤 최종 생성되며, 상대 확인을 거쳐 완주됩니다.
        </p>
      </article>
      <div className="mission-list" aria-label="미션 목록">
        {missions.map((mission) => (
          <button
            className={`mission-list-item ${mission.id === selected.id ? "is-selected" : ""}`}
            key={mission.id}
            onClick={() => {
              setSelectedId(mission.id);
              setEditing(false);
            }}
            type="button"
          >
            <span className={`tag mission-status mission-${mission.status}`}>
              {statusLabel[mission.status]}
            </span>
            <strong>
              {mission.kind === "joint" ? "🤝 공동 퀘스트" : "🎯 개인 미션"}
            </strong>
            <span>{mission.text}</span>
          </button>
        ))}
      </div>
      <article className="card mission-detail">
        <div className="mission-detail-heading">
          <div>
            <h2>
              {selected.kind === "joint" ? "🤝 공동 퀘스트" : "🎯 개인 미션"}
            </h2>
            <p className="mission-meta">
              {selected.kind === "joint"
                ? "참여자: 두 사람"
                : `수행자: ${memberName(selected.owner_member_key, members)}`}
            </p>
          </div>
          <span className={`tag mission-status mission-${selected.status}`}>
            {statusLabel[selected.status]}
          </span>
        </div>
        <p className="mission-text">{selected.text}</p>
        <p className="hint">
          {selected.kind === "joint"
            ? "두 사람이 모두 체크하면 완료됩니다."
            : isOwner
              ? "완료 요청 뒤 상대 확인이 필요합니다."
              : "상대의 완료 요청을 확인할 수 있습니다."}
        </p>
        {selected.kind === "individual" && (
          <div className="mission-actions">
            {isOwner && selected.status === "in_progress" && (
              <button
                className="btn btn-primary"
                disabled={working}
                onClick={() => onAction(selected.id, "complete_request")}
                type="button"
              >
                완료 요청하기
              </button>
            )}
            {!isOwner && selected.status === "completion_requested" && (
              <>
                <button
                  className="btn btn-primary"
                  disabled={working}
                  onClick={() => onAction(selected.id, "confirm")}
                  type="button"
                >
                  수행 확인
                </button>
                <button
                  className="btn btn-outline"
                  disabled={working}
                  onClick={() => onAction(selected.id, "request_revision")}
                  type="button"
                >
                  재수행 요청
                </button>
              </>
            )}
            {isOwner && selected.status === "revision_requested" && (
              <button
                className="btn btn-primary"
                disabled={working}
                onClick={() => onAction(selected.id, "resume")}
                type="button"
              >
                재수행 시작
              </button>
            )}
            {isOwner &&
              ["in_progress", "revision_requested"].includes(
                selected.status,
              ) && (
                <button
                  className="btn btn-outline"
                  disabled={working}
                  onClick={() => onAction(selected.id, "abandon")}
                  type="button"
                >
                  포기하기
                </button>
              )}
          </div>
        )}
        {selected.kind === "joint" && (
          <div className="mission-actions">
            {selected.status === "in_progress" && isParticipant && (
              <button
                className="btn btn-primary"
                disabled={working || checkedIn}
                onClick={() => onAction(selected.id, "joint_checkin")}
                type="button"
              >
                {checkedIn ? "내 완료 체크 완료" : "내 완료 체크"}
              </button>
            )}
            {selected.status === "in_progress" && isParticipant && (
              <button
                className="btn btn-outline"
                disabled={working}
                onClick={() => onAction(selected.id, "abandon")}
                type="button"
              >
                포기하기
              </button>
            )}
          </div>
        )}
        {openOffer ? (
          <section className="notice-box mission-change-offer">
            <strong>수정 제안이 도착했어요</strong>
            <p>
              “{openOffer.proposed_text}” ·{" "}
              {openOffer.proposed_kind === "joint"
                ? "공동 퀘스트"
                : `${memberName(openOffer.proposed_owner_member_key, members)}의 개인 미션`}{" "}
              · {dateLabel(openOffer.proposed_due_date)}
            </p>
            {openOffer.proposer_member_key === myMemberKey ? (
              <button
                className="btn btn-outline"
                disabled={working}
                onClick={() => onResolveChange(openOffer.id, "cancel")}
                type="button"
              >
                수정 제안 취소
              </button>
            ) : (
              <div className="mission-actions">
                <button
                  className="btn btn-primary"
                  disabled={working}
                  onClick={() => onResolveChange(openOffer.id, "accept")}
                  type="button"
                >
                  수락하고 적용
                </button>
                <button
                  className="btn btn-outline"
                  disabled={working}
                  onClick={() => onResolveChange(openOffer.id, "reject")}
                  type="button"
                >
                  거절
                </button>
              </div>
            )}
          </section>
        ) : (
          ["in_progress", "revision_requested"].includes(selected.status) && (
            <button
              className="btn btn-secondary btn-block"
              disabled={working}
              onClick={() => beginEdit(selected)}
              type="button"
            >
              미션 수정 제안
            </button>
          )
        )}
        {editing && (
          <section className="mission-editor">
            <h3>미션 수정 제안</h3>
            <textarea
              aria-label="수정할 미션 내용"
              maxLength={300}
              onChange={(event) => setDraftText(event.target.value)}
              rows={3}
              value={draftText}
            />
            <label>
              유형
              <select
                onChange={(event) =>
                  setDraftKind(event.target.value as "individual" | "joint")
                }
                value={draftKind}
              >
                <option value="individual">개인 미션</option>
                <option value="joint">공동 퀘스트</option>
              </select>
            </label>
            {draftKind === "individual" && (
              <label>
                수행자
                <select
                  onChange={(event) => setDraftOwner(event.target.value)}
                  value={draftOwner}
                >
                  {members.map((member) => (
                    <option
                      key={member.public_member_key}
                      value={member.public_member_key}
                    >
                      {member.room_display_name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="mission-actions">
              <button
                className="btn btn-primary"
                disabled={
                  working ||
                  !draftText.trim() ||
                  (draftKind === "individual" && !draftOwner)
                }
                onClick={() => {
                  onCreateChange(
                    selected.id,
                    draftText,
                    draftKind,
                    draftKind === "individual" ? draftOwner : null,
                  );
                  setEditing(false);
                }}
                type="button"
              >
                상대에게 제안
              </button>
              <button
                className="btn btn-outline"
                onClick={() => setEditing(false)}
                type="button"
              >
                취소
              </button>
            </div>
          </section>
        )}
        {selectedRevisions.length > 1 && (
          <details className="mission-history">
            <summary>미션 버전 기록</summary>
            {selectedRevisions.map((revision) => (
              <p key={revision.revision}>
                v{revision.revision} · {revision.text} ·{" "}
                {dateLabel(revision.due_date)}
              </p>
            ))}
          </details>
        )}
        {error && <p className="notice">{error}</p>}
      </article>
    </section>
  );
}

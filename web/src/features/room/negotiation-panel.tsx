"use client";

import { useState } from "react";

export type SettlementOffer = {
  id: string;
  revision: number;
  proposer_member_key: string;
  selection_mode: "single" | "multiple" | "none";
  status: "open" | "counter_requested" | "accepted" | "continued";
};
export type SettlementTerm = {
  id: string;
  offer_id: string;
  text: string;
  mission_kind: "individual" | "joint";
  responsible_member_key: string | null;
  display_order: number;
};
export type CounterMessage = {
  id: string;
  offer_id: string;
  author_member_key: string;
  body: string;
};
type DraftTerm = {
  text: string;
  responsibility: "proposer" | "responder" | "together";
};

type Props = {
  offer?: SettlementOffer;
  terms: SettlementTerm[];
  counter?: CounterMessage;
  history: SettlementOffer[];
  myMemberKey?: string;
  working: boolean;
  error?: string;
  onBack: () => void;
  onCreate: (mode: "single" | "multiple" | "none", terms: DraftTerm[]) => void;
  onCounter: (body: string) => void;
  onAccept: (termIds: string[]) => void;
  onContinue: () => void;
};

const initialTerms: DraftTerm[] = [{ text: "", responsibility: "proposer" }];

export function NegotiationPanel({
  offer,
  terms,
  counter,
  history,
  myMemberKey,
  working,
  error,
  onBack,
  onCreate,
  onCounter,
  onAccept,
  onContinue,
}: Props) {
  const [draftTerms, setDraftTerms] = useState<DraftTerm[]>(() =>
    offer?.status === "counter_requested" &&
    offer.proposer_member_key === myMemberKey
      ? terms.map((term) => ({
          text: term.text,
          responsibility:
            term.mission_kind === "joint"
              ? "together"
              : term.responsible_member_key === myMemberKey
                ? "proposer"
                : "responder",
        }))
      : initialTerms,
  );
  const [mode, setMode] = useState<"single" | "multiple" | "none">(() =>
    offer?.status === "counter_requested" &&
    offer.proposer_member_key === myMemberKey
      ? offer.selection_mode
      : "single",
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [counterText, setCounterText] = useState("");
  const [counterOpen, setCounterOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const isProposer = Boolean(
    offer && offer.proposer_member_key === myMemberKey,
  );
  const isCountered = offer?.status === "counter_requested";

  const readOnlyTerms = (
    <div className="negotiation-terms">
      {terms.length === 0 ? (
        <div className="notice-box">
          조건 없이 합의하는 제안입니다. 수락하면 미션 없이 대국방이 종료됩니다.
        </div>
      ) : (
        terms.map((term) => (
          <div className="negotiation-condition" key={term.id}>
            <strong>조건 {term.display_order + 1}</strong> · {term.text}
            <p>
              책임 주체:{" "}
              {term.mission_kind === "joint"
                ? "함께"
                : term.responsible_member_key === myMemberKey
                  ? "나"
                  : "상대"}
            </p>
          </div>
        ))
      )}
    </div>
  );
  const editor = (
    <section className="card negotiation-card">
      <h2>
        {isCountered ? "무승부 제안 수정 (제안자)" : "무승부 제안 작성 (제안자)"}
      </h2>
      {isCountered && counter && (
        <div className="notice-box">
          <strong>상대의 카운터오퍼</strong>
          <br />
          {counter.body}
        </div>
      )}
      <div className="form-group">
        <p className="form-label">상대 선택 방식</p>
        <div className="radio-group">
          <label>
            <input
              checked={mode === "single"}
              disabled={draftTerms.length === 0}
              name="choice-mode"
              onChange={() => setMode("single")}
              type="radio"
            />{" "}
            한 개 선택
          </label>
          <label>
            <input
              checked={mode === "multiple"}
              disabled={draftTerms.length === 0}
              name="choice-mode"
              onChange={() => setMode("multiple")}
              type="radio"
            />{" "}
            여러 개 선택
          </label>
        </div>
      </div>
      <div className="form-group">
        <p className="form-label">협상 조건 항목</p>
        {draftTerms.length === 0 ? (
          <div className="warning-box">
            합의 조건이 0개입니다. 수락 시 미션 없이 대국방이 종료됩니다.
          </div>
        ) : (
          <div className="negotiation-terms">
            {draftTerms.map((term, index) => (
              <div className="negotiation-condition" key={index}>
                <input
                  aria-label={`조건 ${index + 1}`}
                  onChange={(event) =>
                    setDraftTerms((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, text: event.target.value }
                          : item,
                      ),
                    )
                  }
                  value={term.text}
                />
                <div className="radio-group">
                  <span>책임:</span>
                  {(["proposer", "responder", "together"] as const).map(
                    (responsibility) => (
                      <label key={responsibility}>
                        <input
                          checked={term.responsibility === responsibility}
                          name={`responsibility-${index}`}
                          onChange={() =>
                            setDraftTerms((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, responsibility }
                                  : item,
                              ),
                            )
                          }
                          type="radio"
                        />{" "}
                        {responsibility === "proposer"
                          ? "나"
                          : responsibility === "responder"
                            ? "상대"
                            : "함께"}
                      </label>
                    ),
                  )}
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() =>
                      setDraftTerms((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    type="button"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="sheet-actions">
          <button
            className="btn btn-sm btn-secondary"
            disabled={draftTerms.length >= 5}
            onClick={() =>
              setDraftTerms((current) => [
                ...current,
                { text: "", responsibility: "proposer" },
              ])
            }
            type="button"
          >
            + 조건 추가
          </button>
          <button
            className="btn btn-sm btn-outline"
            onClick={() => setDraftTerms([])}
            type="button"
          >
            조건 0개로 설정
          </button>
        </div>
      </div>
      <div className="sheet-actions">
        <button className="btn btn-secondary" onClick={onBack} type="button">
          계속 대국
        </button>
        <button
          className="btn btn-primary"
          disabled={working || draftTerms.some((term) => !term.text.trim())}
          onClick={() =>
            onCreate(draftTerms.length === 0 ? "none" : mode, draftTerms)
          }
          type="button"
        >
          제안하기
        </button>
      </div>
    </section>
  );

  return (
    <section className="negotiation-page">
      <h1 className="section-title">🤝 조건부 무승부 협상</h1>
      {!offer || (isProposer && isCountered) ? (
        editor
      ) : isProposer ? (
        <section className="card negotiation-card">
          <div className="negotiation-title">
            <div>
              <h2>내가 보낸 무승부 제안</h2>
              <p>
                {isCountered
                  ? "상대의 카운터오퍼를 확인했습니다. 아래 요청을 참고해 새 제안을 작성할 수 있습니다."
                  : "상대가 수락·계속 대국·카운터오퍼 중 하나로 응답할 때까지 수정하거나 재발송할 수 없습니다."}
              </p>
            </div>
            <span className="tag tag-pending">
              {isCountered ? "카운터오퍼 도착" : "상대 응답 대기"}
            </span>
          </div>
          {readOnlyTerms}
          {counter && (
            <div className="notice-box">
              <strong>상대의 카운터오퍼</strong>
              <br />
              {counter.body}
            </div>
          )}
          <div className="sheet-actions">
            <button
              className="btn btn-outline"
              onClick={() => setHistoryOpen(true)}
              type="button"
            >
              무승부 협상 기록 보기
            </button>
            {!isCountered && (
              <button
                className="btn btn-secondary"
                disabled={working}
                onClick={onContinue}
                type="button"
              >
                계속 대국
              </button>
            )}
            {isCountered && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setMode(offer.selection_mode);
                  setDraftTerms(
                    terms.map((term) => ({
                      text: term.text,
                      responsibility:
                        term.mission_kind === "joint"
                          ? "together"
                          : term.responsible_member_key === myMemberKey
                            ? "proposer"
                            : "responder",
                    })),
                  );
                }}
                type="button"
              >
                수정하기
              </button>
            )}
          </div>
        </section>
      ) : isCountered ? (
        <section className="card negotiation-card">
          <div className="negotiation-title">
            <div>
              <h2>카운터오퍼를 보냈어요</h2>
              <p>
                상대가 수정한 새 제안을 보낼 때까지 기존 제안을 수락하거나 다시
                카운터오퍼를 보낼 수 없습니다.
              </p>
            </div>
            <span className="tag tag-pending">제안자 수정 대기</span>
          </div>
          {counter && (
            <div className="notice-box">
              <strong>내 카운터오퍼</strong>
              <br />
              {counter.body}
            </div>
          )}
          <button
            className="btn btn-outline btn-block"
            onClick={() => setHistoryOpen(true)}
            type="button"
          >
            무승부 협상 기록 보기
          </button>
        </section>
      ) : (
        <section className="card negotiation-card">
          <h2>상대방의 무승부 제안</h2>
          <p className="card-sub">
            조건을 선택 후 수락하면 대국이 종료되고 선택된 조건만 미션으로
            생성됩니다.
          </p>
          {terms.length === 0 ? (
            <div className="notice-box">
              🤝 <strong>조건 0개 제안:</strong> 합의할 조건이 없습니다.
              수락하면 미션 작성 없이 대국방이 종료됩니다.
            </div>
          ) : (
            <div className="negotiation-terms">
              {terms.map((term) => (
                <label
                  className="negotiation-condition selection-condition"
                  key={term.id}
                >
                  <span className="selection-row">
                    <input
                      checked={selected.includes(term.id)}
                      name="term-selection"
                      onChange={() =>
                        setSelected((current) =>
                          offer.selection_mode === "single"
                            ? [term.id]
                            : current.includes(term.id)
                              ? current.filter((id) => id !== term.id)
                              : [...current, term.id],
                        )
                      }
                      type={
                        offer.selection_mode === "single" ? "radio" : "checkbox"
                      }
                    />
                    <span className="selection-copy">
                      <strong>{term.text}</strong>
                      <span className="selection-responsibility">
                        책임 주체:{" "}
                        {term.mission_kind === "joint"
                          ? "함께"
                          : term.responsible_member_key === myMemberKey
                            ? "나"
                            : "상대"}
                      </span>
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="negotiation-actions">
            <button
              className="btn btn-primary btn-block"
              disabled={working || (terms.length > 0 && selected.length === 0)}
              onClick={() => onAccept(selected)}
              type="button"
            >
              {terms.length === 0 ? "조건 없이 수락하기" : "선택 후 수락하기"}
            </button>
            <button
              className="btn btn-outline btn-block"
              disabled={working}
              onClick={() => setCounterOpen(true)}
              type="button"
            >
              카운터오퍼 메시지 보내기
            </button>
            <button
              className="btn btn-secondary btn-block"
              disabled={working}
              onClick={onContinue}
              type="button"
            >
              계속 대국하기
            </button>
          </div>
        </section>
      )}
      {error && <p className="notice">{error}</p>}
      {counterOpen && (
        <section className="sheet-overlay active" role="dialog">
          <div className="sheet-content">
            <header className="sheet-header">
              <h2>💬 카운터오퍼 메시지 작성</h2>
              <button
                className="btn-icon"
                onClick={() => setCounterOpen(false)}
                type="button"
              >
                ✕
              </button>
            </header>
            <div className="notice-box">
              제안 수정을 요구하는 의견을 메시지로 작성합니다. (제안자가 확인 후
              수정)
            </div>
            <textarea
              aria-label="카운터오퍼 메시지"
              onChange={(event) => setCounterText(event.target.value)}
              placeholder="예: 조건 1의 주체를 '함께'로 바꿔주면 수락할게!"
              rows={3}
              value={counterText}
            />
            <button
              className="btn btn-primary btn-block"
              disabled={working || !counterText.trim()}
              onClick={() => onCounter(counterText)}
              type="button"
            >
              카운터오퍼 전송
            </button>
          </div>
        </section>
      )}
      {historyOpen && (
        <section className="sheet-overlay active" role="dialog">
          <div className="sheet-content">
            <header className="sheet-header">
              <h2>🗂 무승부 협상 기록</h2>
              <button
                className="btn-icon"
                onClick={() => setHistoryOpen(false)}
                type="button"
              >
                ✕
              </button>
            </header>
            <div className="notice-box">
              현재 또는 가장 최근 협상 1건의 제안·카운터오퍼·수락·종료·합의
              결과를 읽기 전용으로 확인합니다.
            </div>
            {history.map((item) => (
              <article className="card" key={item.id}>
                <strong>제안 v{item.revision}</strong> ·{" "}
                {item.status === "accepted"
                  ? "무승부 합의"
                  : item.status === "continued"
                    ? "계속 대국"
                    : item.status === "counter_requested"
                      ? "카운터오퍼 요청"
                      : "응답 대기"}
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

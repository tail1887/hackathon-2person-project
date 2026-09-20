"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { getFunctionErrorMessage } from "@/lib/supabase/function-error";
import {
  NegotiationPanel,
  type CounterMessage,
  type SettlementOffer,
  type SettlementTerm,
} from "./negotiation-panel";
import {
  MissionBoard,
  type Mission,
  type MissionAction,
  type MissionChangeOffer,
  type MissionParticipant,
  type MissionRevision,
} from "./mission-board";

type Room = { id: string; status: "active" | "closed"; room_revision: number };
type Member = {
  room_id: string;
  role: "creator" | "invitee";
  public_member_key: string;
  room_display_name: string;
  is_self: boolean;
};
type Message = {
  id: string;
  room_id: string;
  sender_member_key: string;
  body: string;
  sequence: number;
  sent_at: string;
};
type ConnectionState = "loading" | "connected" | "recovering" | "failed";
type JudgeResult = {
  result_type: "normal" | "restricted";
  risk: string;
  inference: string;
  recommendations: { text: string }[];
};
type PositionResult = {
  current_position: string;
  issues: string[];
  next_move: string;
};
type ReviewResult = {
  summary: string;
  different_points: string[];
  wishes_and_worries: string[];
  next_move: string;
};
type ReviewRequest = {
  id: string;
  status: "pending" | "processing" | "ready" | "failed" | "cancelled";
  is_requester: boolean;
  is_responder: boolean;
  can_retry: boolean;
  can_cancel: boolean;
};
type RoomReview = {
  id: string;
  result: ReviewResult;
  status: "ready";
  created_at: string;
};
type Settlement = {
  id: string;
  status: "open" | "agreed" | "cancelled";
  active_offer_id: string | null;
};

export function RoomScreen({
  roomId,
  view = "room",
}: {
  roomId: string;
  view?: "room" | "missions";
}) {
  const supabase = getBrowserSupabase();
  const [room, setRoom] = useState<Room>();
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [connection, setConnection] = useState<ConnectionState>("loading");
  const [draft, setDraft] = useState("");
  const [judge, setJudge] = useState<{ id: string; result: JudgeResult }>();
  const [judgeError, setJudgeError] = useState<string>();
  const [isJudging, setIsJudging] = useState(false);
  const [position, setPosition] = useState<PositionResult>();
  const [reviewRequest, setReviewRequest] = useState<ReviewRequest>();
  const [roomReview, setRoomReview] = useState<RoomReview>();
  const [roomReviewHistory, setRoomReviewHistory] = useState<RoomReview[]>([]);
  const [isRoomReviewOpen, setIsRoomReviewOpen] = useState(false);
  const [isRoomReviewHistoryOpen, setIsRoomReviewHistoryOpen] = useState(false);
  const [selectedRoomReviewId, setSelectedRoomReviewId] = useState<string>();
  const [toolError, setToolError] = useState<string>();
  const [isToolWorking, setIsToolWorking] = useState(false);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [settlementOffers, setSettlementOffers] = useState<SettlementOffer[]>(
    [],
  );
  const [settlementTerms, setSettlementTerms] = useState<SettlementTerm[]>([]);
  const [counterMessages, setCounterMessages] = useState<CounterMessage[]>([]);
  const [isNegotiationOpen, setIsNegotiationOpen] = useState(false);
  const [isSettlementWorking, setIsSettlementWorking] = useState(false);
  const [settlementError, setSettlementError] = useState<string>();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [missionParticipants, setMissionParticipants] = useState<
    MissionParticipant[]
  >([]);
  const [missionActions, setMissionActions] = useState<MissionAction[]>([]);
  const [missionChangeOffers, setMissionChangeOffers] = useState<
    MissionChangeOffer[]
  >([]);
  const [missionRevisions, setMissionRevisions] = useState<MissionRevision[]>(
    [],
  );
  const [isMissionWorking, setIsMissionWorking] = useState(false);
  const [missionError, setMissionError] = useState<string>();
  const latestRevision = useRef(0);
  const recovering = useRef(false);

  const loadSnapshot = useCallback(async () => {
    if (!supabase) return false;
    const [
      roomResult,
      membersResult,
      messagesResult,
      reviewRequestResult,
      roomReviewResult,
      roomReviewHistoryResult,
      settlementsResult,
      offersResult,
      termsResult,
      countersResult,
      missionsResult,
      participantsResult,
      actionsResult,
      changeOffersResult,
      revisionsResult,
    ] = await Promise.all([
      supabase
        .from("room_public")
        .select("id,status,room_revision")
        .eq("id", roomId)
        .maybeSingle(),
      supabase
        .from("room_member_public")
        .select("room_id,role,public_member_key,room_display_name,is_self")
        .eq("room_id", roomId),
      supabase
        .from("room_message_public")
        .select("id,room_id,sender_member_key,body,sequence,sent_at")
        .eq("room_id", roomId)
        .order("sequence"),
      supabase
        .from("room_review_request_public")
        .select("id,status,is_requester,is_responder,can_retry,can_cancel")
        .eq("room_id", roomId)
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("room_review_public")
        .select("id,result,status,created_at")
        .eq("room_id", roomId)
        .eq("status", "ready")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("room_review_public")
        .select("id,result,status,created_at")
        .eq("room_id", roomId)
        .eq("status", "ready")
        .order("created_at", { ascending: false }),
      supabase
        .from("settlement_public")
        .select("id,status,active_offer_id")
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("settlement_offer_public")
        .select("id,revision,proposer_member_key,selection_mode,status")
        .eq("room_id", roomId)
        .order("revision"),
      supabase
        .from("settlement_term_public")
        .select(
          "id,offer_id,text,mission_kind,responsible_member_key,display_order",
        )
        .eq("room_id", roomId)
        .order("display_order"),
      supabase
        .from("settlement_counter_message_public")
        .select("id,offer_id,author_member_key,body")
        .eq("room_id", roomId),
      supabase
        .from("mission_public")
        .select(
          "id,room_id,current_revision,kind,owner_member_key,text,due_date,status",
        )
        .eq("room_id", roomId)
        .order("created_at"),
      supabase
        .from("mission_participant_public")
        .select("mission_id,public_member_key")
        .eq("room_id", roomId),
      supabase
        .from("mission_action_public")
        .select("id,mission_id,revision,actor_member_key,type,note,created_at")
        .eq("room_id", roomId)
        .order("created_at"),
      supabase
        .from("mission_change_offer_public")
        .select(
          "id,mission_id,base_revision,proposer_member_key,proposed_text,proposed_due_date,proposed_kind,proposed_owner_member_key,status,created_at",
        )
        .eq("room_id", roomId)
        .order("created_at", { ascending: false }),
      supabase
        .from("mission_revision_public")
        .select(
          "mission_id,revision,text,due_date,kind,owner_member_key,applied_at",
        )
        .eq("room_id", roomId)
        .order("revision"),
    ]);
    if (
      roomResult.error ||
      !roomResult.data ||
      membersResult.error ||
      messagesResult.error
    )
      return false;
    const nextRoom = roomResult.data as Room;
    if (nextRoom.room_revision < latestRevision.current) return true;
    latestRevision.current = nextRoom.room_revision;
    setRoom(nextRoom);
    setMembers((membersResult.data ?? []) as Member[]);
    setMessages((messagesResult.data ?? []) as Message[]);
    setReviewRequest(
      (reviewRequestResult.data ?? undefined) as ReviewRequest | undefined,
    );
    setRoomReview(
      (roomReviewResult.data ?? undefined) as RoomReview | undefined,
    );
    setRoomReviewHistory((roomReviewHistoryResult.data ?? []) as RoomReview[]);
    setSettlements((settlementsResult.data ?? []) as Settlement[]);
    setSettlementOffers((offersResult.data ?? []) as SettlementOffer[]);
    setSettlementTerms((termsResult.data ?? []) as SettlementTerm[]);
    setCounterMessages((countersResult.data ?? []) as CounterMessage[]);
    setMissions((missionsResult.data ?? []) as Mission[]);
    setMissionParticipants(
      (participantsResult.data ?? []) as MissionParticipant[],
    );
    setMissionActions((actionsResult.data ?? []) as MissionAction[]);
    setMissionChangeOffers(
      (changeOffersResult.data ?? []) as MissionChangeOffer[],
    );
    setMissionRevisions((revisionsResult.data ?? []) as MissionRevision[]);
    return true;
  }, [roomId, supabase]);

  const recover = useCallback(() => {
    if (recovering.current) return;
    recovering.current = true;
    setConnection("recovering");
    const startedAt = Date.now();
    const retry = async () => {
      if (await loadSnapshot()) {
        recovering.current = false;
        setConnection("connected");
        return;
      }
      if (Date.now() - startedAt >= 30_000) {
        recovering.current = false;
        setConnection("failed");
        return;
      }
      window.setTimeout(() => void retry(), 2_000);
    };
    void retry();
  }, [loadSnapshot]);

  async function requestJudge() {
    if (!supabase || !draft.trim()) return;
    setIsJudging(true);
    setJudge(undefined);
    setJudgeError(undefined);
    const { data, error } = await supabase.functions.invoke("ai-judge", {
      body: { roomId, body: draft },
    });
    setIsJudging(false);
    if (error || !data?.ok) {
      setJudgeError(
        error
          ? await getFunctionErrorMessage(error, "AI 심판을 준비하지 못했어요.")
          : (data?.error?.message ?? "AI 심판을 준비하지 못했어요."),
      );
      return;
    }
    setJudge({
      id: data.data.analysisId,
      result: data.data.result as JudgeResult,
    });
  }

  async function sendChoice(
    choice: "original" | "recommendation",
    recommendationIndex?: number,
  ) {
    if (!supabase || !judge) return;
    setIsJudging(true);
    setJudgeError(undefined);
    const { data, error } = await supabase.functions.invoke("message-send", {
      body: { analysisId: judge.id, choice, recommendationIndex },
    });
    setIsJudging(false);
    if (error || !data?.ok) {
      setJudgeError(
        error
          ? await getFunctionErrorMessage(error, "메시지를 전송하지 못했어요.")
          : (data?.error?.message ?? "메시지를 전송하지 못했어요."),
      );
      return;
    }
    setDraft("");
    setJudge(undefined);
    await loadSnapshot();
  }

  async function requestPosition() {
    if (!supabase) return;
    setIsToolWorking(true);
    setToolError(undefined);
    setPosition(undefined);
    const { data, error } = await supabase.functions.invoke(
      "private-position",
      { body: { roomId } },
    );
    setIsToolWorking(false);
    if (error || !data?.ok) {
      setToolError(
        error
          ? await getFunctionErrorMessage(
              error,
              "형세 파악을 준비하지 못했어요.",
            )
          : (data?.error?.message ?? "형세 파악을 준비하지 못했어요."),
      );
      return;
    }
    setPosition(data.data.result as PositionResult);
  }

  async function requestRoomReview() {
    if (!supabase) return;
    setIsToolWorking(true);
    setToolError(undefined);
    const { data, error } = await supabase.functions.invoke(
      "room-review-request",
      { body: { roomId } },
    );
    setIsToolWorking(false);
    if (error || !data?.ok) {
      setToolError(
        error
          ? await getFunctionErrorMessage(error, "AI 문철을 신청하지 못했어요.")
          : (data?.error?.message ?? "AI 문철을 신청하지 못했어요."),
      );
      return;
    }
    await loadSnapshot();
  }

  async function acceptRoomReview() {
    if (!supabase || !reviewRequest) return;
    setIsToolWorking(true);
    setToolError(undefined);
    const { data, error } = await supabase.functions.invoke(
      "room-review-accept",
      { body: { requestId: reviewRequest.id } },
    );
    setIsToolWorking(false);
    if (error || !data?.ok) {
      setToolError(
        error
          ? await getFunctionErrorMessage(error, "AI 문철을 수락하지 못했어요.")
          : (data?.error?.message ?? "AI 문철을 수락하지 못했어요."),
      );
      return;
    }
    await loadSnapshot();
  }

  async function retryRoomReview() {
    if (!supabase || !reviewRequest) return;
    setIsToolWorking(true);
    setToolError(undefined);
    const { data, error } = await supabase.functions.invoke(
      "room-review-retry",
      { body: { requestId: reviewRequest.id } },
    );
    setIsToolWorking(false);
    if (error || !data?.ok) {
      setToolError(
        error
          ? await getFunctionErrorMessage(
              error,
              "AI 문철을 다시 준비하지 못했어요.",
            )
          : (data?.error?.message ?? "AI 문철을 다시 준비하지 못했어요."),
      );
      return;
    }
    await loadSnapshot();
  }

  async function cancelRoomReview() {
    if (!supabase || !reviewRequest) return;
    setIsToolWorking(true);
    setToolError(undefined);
    const { data, error } = await supabase.functions.invoke(
      "room-review-cancel",
      { body: { requestId: reviewRequest.id } },
    );
    setIsToolWorking(false);
    if (error || !data?.ok) {
      setToolError(
        error
          ? await getFunctionErrorMessage(error, "AI 문철을 취소하지 못했어요.")
          : (data?.error?.message ?? "AI 문철을 취소하지 못했어요."),
      );
      return;
    }
    await loadSnapshot();
  }

  async function createSettlement(
    selectionMode: "single" | "multiple" | "none",
    terms: {
      text: string;
      responsibility: "proposer" | "responder" | "together";
    }[],
  ) {
    if (!supabase) return;
    setIsSettlementWorking(true);
    setSettlementError(undefined);
    const { data, error } = await supabase.rpc("create_settlement_offer", {
      p_room_id: roomId,
      p_selection_mode: selectionMode,
      p_terms: terms,
    });
    const result = data?.[0];
    setIsSettlementWorking(false);
    if (error || !result || result.error_code) {
      setSettlementError(
        "무승부 제안을 저장하지 못했어요. 조건을 확인해 다시 시도해 주세요.",
      );
      return;
    }
    await loadSnapshot();
  }
  async function counterSettlement(body: string) {
    if (!supabase || !activeOffer) return;
    setIsSettlementWorking(true);
    setSettlementError(undefined);
    const { data, error } = await supabase.rpc("counter_settlement_offer", {
      p_offer_id: activeOffer.id,
      p_body: body,
    });
    const result = data?.[0];
    setIsSettlementWorking(false);
    if (error || !result || result.error_code) {
      setSettlementError("카운터오퍼를 보내지 못했어요. 다시 시도해 주세요.");
      return;
    }
    await loadSnapshot();
  }
  async function continueSettlement() {
    if (!supabase || !activeOffer) return;
    setIsSettlementWorking(true);
    setSettlementError(undefined);
    const { data, error } = await supabase.rpc(
      "continue_after_settlement_offer",
      { p_offer_id: activeOffer.id },
    );
    const result = data?.[0];
    setIsSettlementWorking(false);
    if (error || !result || result.error_code) {
      setSettlementError("협상을 종료하지 못했어요. 다시 시도해 주세요.");
      return;
    }
    setIsNegotiationOpen(false);
    await loadSnapshot();
  }
  async function acceptSettlement(termIds: string[]) {
    if (!supabase || !activeOffer) return;
    setIsSettlementWorking(true);
    setSettlementError(undefined);
    const { data, error } = await supabase.rpc("accept_settlement_offer", {
      p_offer_id: activeOffer.id,
      p_term_ids: termIds,
    });
    const result = data?.[0];
    setIsSettlementWorking(false);
    if (error || !result || result.error_code) {
      setSettlementError("조건 선택을 확인한 뒤 다시 수락해 주세요.");
      return;
    }
    setIsNegotiationOpen(false);
    await loadSnapshot();
  }
  async function recordMissionAction(
    missionId: string,
    action:
      | "complete_request"
      | "confirm"
      | "request_revision"
      | "resume"
      | "abandon"
      | "joint_checkin",
  ) {
    if (!supabase) return;
    setIsMissionWorking(true);
    setMissionError(undefined);
    const { data, error } = await supabase.rpc("record_mission_action", {
      p_mission_id: missionId,
      p_action: action,
      p_note: null,
    });
    const result = data?.[0];
    setIsMissionWorking(false);
    if (error || !result || result.error_code) {
      setMissionError(
        "미션 상태를 바꾸지 못했어요. 최신 상태를 확인한 뒤 다시 시도해 주세요.",
      );
      return;
    }
    await loadSnapshot();
  }
  async function createMissionChange(
    missionId: string,
    text: string,
    dueDate: string | null,
    kind: "individual" | "joint",
    ownerMemberKey: string | null,
  ) {
    if (!supabase) return;
    setIsMissionWorking(true);
    setMissionError(undefined);
    const { data, error } = await supabase.rpc("create_mission_change_offer", {
      p_mission_id: missionId,
      p_text: text,
      p_due_date: dueDate,
      p_kind: kind,
      p_owner_member_key: ownerMemberKey,
    });
    const result = data?.[0];
    setIsMissionWorking(false);
    if (error || !result || result.error_code) {
      setMissionError(
        "미션 수정 제안을 보내지 못했어요. 내용을 확인해 다시 시도해 주세요.",
      );
      return;
    }
    await loadSnapshot();
  }
  async function resolveMissionChange(
    changeOfferId: string,
    resolution: "accept" | "reject" | "cancel",
  ) {
    if (!supabase) return;
    setIsMissionWorking(true);
    setMissionError(undefined);
    const { data, error } = await supabase.rpc("resolve_mission_change_offer", {
      p_change_offer_id: changeOfferId,
      p_resolution: resolution,
    });
    const result = data?.[0];
    setIsMissionWorking(false);
    if (error || !result || result.error_code) {
      setMissionError(
        "미션 수정 제안을 처리하지 못했어요. 최신 상태를 확인한 뒤 다시 시도해 주세요.",
      );
      return;
    }
    await loadSnapshot();
  }

  useEffect(() => {
    if (!supabase) return;
    let disposed = false;
    void loadSnapshot().then((loaded) => {
      if (disposed) return;
      setConnection(loaded ? "connected" : "failed");
    });
    const channel = supabase
      .channel(`room:${roomId}`, { config: { private: true } })
      .on(
        "broadcast",
        { event: "room.member_joined" },
        () => void loadSnapshot(),
      )
      .on("broadcast", { event: "message.sent" }, () => void loadSnapshot())
      .on(
        "broadcast",
        { event: "room.review_changed" },
        () => void loadSnapshot(),
      )
      .on(
        "broadcast",
        { event: "settlement.offer_changed" },
        () => void loadSnapshot(),
      )
      .on(
        "broadcast",
        { event: "settlement.cancelled" },
        () => void loadSnapshot(),
      )
      .on(
        "broadcast",
        { event: "settlement.agreed" },
        () => void loadSnapshot(),
      )
      .on("broadcast", { event: "mission.created" }, () => void loadSnapshot())
      .on("broadcast", { event: "mission.updated" }, () => void loadSnapshot())
      .on(
        "broadcast",
        { event: "mission.change_offer_changed" },
        () => void loadSnapshot(),
      )
      .subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          void loadSnapshot().then((loaded) =>
            loaded ? setConnection("connected") : recover(),
          );
        }
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        )
          recover();
      });
    return () => {
      disposed = true;
      void supabase.removeChannel(channel);
    };
  }, [loadSnapshot, recover, roomId, supabase]);

  if (!supabase)
    return (
      <main className="auth-shell">
        <p className="notice">Supabase 연결값이 필요해요.</p>
      </main>
    );
  if (!room && connection === "loading")
    return (
      <main className="auth-shell">
        <p className="notice">대국방을 불러오는 중이에요.</p>
      </main>
    );
  if (!room)
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">대국방</p>
          <h1>대국방을 열 수 없어요</h1>
          <p className="muted">권한을 확인한 뒤 다시 시도해 주세요.</p>
          <Link className="secondary-button room-link-button" href="/">
            메인으로 돌아가기
          </Link>
        </section>
      </main>
    );

  const participantNames = members
    .map((member) => member.room_display_name)
    .join(" · ");
  const latestSettlement = settlements[0];
  const activeOffer = latestSettlement?.active_offer_id
    ? settlementOffers.find(
        (offer) => offer.id === latestSettlement.active_offer_id,
      )
    : undefined;
  const activeTerms = activeOffer
    ? settlementTerms.filter((term) => term.offer_id === activeOffer.id)
    : [];
  const activeCounter = activeOffer
    ? counterMessages.find((message) => message.offer_id === activeOffer.id)
    : undefined;
  const myMemberKey = members.find(
    (member) => member.is_self,
  )?.public_member_key;
  const previousRoomReviews = roomReview
    ? roomReviewHistory.filter((review) => review.id !== roomReview.id)
    : [];
  const selectedHistoricalReview = previousRoomReviews.find(
    (review) => review.id === selectedRoomReviewId,
  );

  const missionBoard = (
    <MissionBoard
      actions={missionActions}
      changeOffers={missionChangeOffers}
      error={missionError}
      members={members}
      missions={missions}
      myMemberKey={myMemberKey}
      onAction={(missionId, action) =>
        void recordMissionAction(missionId, action)
      }
      onCreateChange={(missionId, text, dueDate, kind, ownerMemberKey) =>
        void createMissionChange(missionId, text, dueDate, kind, ownerMemberKey)
      }
      onResolveChange={(changeOfferId, resolution) =>
        void resolveMissionChange(changeOfferId, resolution)
      }
      participants={missionParticipants}
      revisions={missionRevisions}
      working={isMissionWorking}
    />
  );

  if (view === "missions")
    return (
      <main className="app-shell">
        <section className="app-frame mockup-app-frame">
          <header className="app-header">
            <Link
              aria-label="대국 기록으로 돌아가기"
              className="btn-icon"
              href={`/rooms/${roomId}`}
            >
              ←
            </Link>
            <span className="app-title">
              <span aria-hidden="true">⚖️</span> AI 심판
            </span>
            <Link aria-label="메인으로 돌아가기" className="btn-icon" href="/">
              🏠
            </Link>
          </header>
          <div className="app-content room-page mockup-room-page">
            {room.status !== "closed" ? (
              <section className="card empty-card">
                <h1>아직 대국이 진행 중이에요</h1>
                <p>미션 보드는 무승부 합의로 대국이 종료된 뒤 열립니다.</p>
                <Link className="btn btn-primary" href={`/rooms/${roomId}`}>
                  대국방으로 돌아가기
                </Link>
              </section>
            ) : (
              missionBoard
            )}
          </div>
        </section>
      </main>
    );

  return (
    <main className="app-shell">
      <section className="app-frame mockup-app-frame">
        <header className="app-header">
          <span className="btn-icon-placeholder" aria-hidden="true">
            ←
          </span>
          <span className="app-title">
            <span aria-hidden="true">⚖️</span> AI 심판
          </span>
          <Link aria-label="메인으로 돌아가기" className="btn-icon" href="/">
            🏠
          </Link>
        </header>
        <div className="app-content room-page mockup-room-page">
          {connection === "recovering" && (
            <p className="connection-notice">
              연결을 복구하는 중이에요. 마지막 대국 기록을 읽기 전용으로
              보여드려요.
            </p>
          )}
          {connection === "failed" && (
            <p className="notice">
              연결을 복구하지 못했어요.{" "}
              <button className="inline-button" onClick={recover} type="button">
                다시 시도
              </button>
            </p>
          )}
          <section
            className="room-summary mockup-room-summary"
            aria-label="대국방 요약"
          >
            <div>
              <span className="room-summary-name">
                {participantNames || "대국방"}
              </span>{" "}
              <span
                className={`tag ${room.status === "active" ? "tag-active" : "tag-closed"}`}
              >
                {room.status === "active" ? "진행 중" : "종료됨"}
              </span>
            </div>
            <span className="room-id-label">방번호 #{room.id.slice(0, 8)}</span>
          </section>
          {members.length < 2 && (
            <p className="connection-notice">
              상대가 입장하면 대국방이 자동으로 연결됩니다.
            </p>
          )}
          {room.status === "closed" && (
            <section className="card room-ended-card" role="status">
              <span className="tag tag-closed">대국 종료</span>
              <h1>대국이 종료되었어요</h1>
              <p>
                {missions.length > 0
                  ? "선택한 조건으로 미션이 생성되었습니다. 미션 페이지에서 함께 이어가 볼까요?"
                  : "조건 없이 합의가 완료되었습니다. 대국 기록은 읽기 전용으로 남아 있습니다."}
              </p>
              <div className="sheet-actions">
                {missions.length > 0 && (
                  <Link
                    className="btn btn-primary"
                    href={`/missions/${roomId}`}
                  >
                    미션 페이지로 이동
                  </Link>
                )}
                <Link className="btn btn-outline" href="/">
                  메인으로 돌아가기
                </Link>
              </div>
            </section>
          )}
          {activeOffer && room.status === "active" && (
            <section className="notice-box room-review-banner">
              <strong>🤝 무승부 제안 진행 중:</strong>
              <span>
                {activeOffer.proposer_member_key === myMemberKey
                  ? activeOffer.status === "counter_requested"
                    ? " 카운터오퍼가 도착했습니다. 제안을 수정할 수 있습니다."
                    : " 상대방의 수락/카운터오퍼 대기 중"
                  : activeOffer.status === "counter_requested"
                    ? " 카운터오퍼를 보냈습니다. 상대의 수정 제안을 기다리고 있어요."
                    : " 상대방의 무승부 제안이 도착했습니다."}
              </span>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => setIsNegotiationOpen(true)}
                type="button"
              >
                보기
              </button>
            </section>
          )}
          {reviewRequest?.status === "pending" && (
            <section className="notice-box room-review-banner">
              <strong>
                {reviewRequest.is_responder
                  ? "AI 문철 신청이 도착했어요"
                  : "AI 문철 신청을 보냈어요"}
              </strong>
              <span>
                {reviewRequest.is_responder
                  ? " 두 사람이 함께 확인할 공용 문철을 만들까요?"
                  : " 상대의 수락을 기다리고 있어요."}
              </span>
              {reviewRequest.is_responder && (
                <button
                  className="btn btn-sm btn-primary"
                  disabled={isToolWorking}
                  onClick={acceptRoomReview}
                  type="button"
                >
                  동의하고 시작
                </button>
              )}
            </section>
          )}
          {reviewRequest?.status === "processing" && (
            <section className="notice-box room-review-banner">
              <strong>AI 문철을 준비하고 있어요</strong>
              <span> 두 사람의 대화를 함께 정리하는 중이에요.</span>
            </section>
          )}
          {reviewRequest?.status === "failed" && (
            <section className="warning-box room-review-banner">
              <strong>AI 문철을 준비하지 못했어요</strong>
              <p>
                분석 내용은 저장하거나 보여 주지 않았어요.{" "}
                {reviewRequest.is_requester
                  ? "같은 대화 기준으로 한 번만 다시 시도하거나 취소할 수 있어요."
                  : "신청자가 다시 시도하거나 새 신청을 만들 수 있어요."}
              </p>
              {reviewRequest.is_requester && (
                <div className="sheet-actions">
                  {reviewRequest.can_retry && (
                    <button
                      className="btn btn-primary"
                      disabled={isToolWorking}
                      onClick={retryRoomReview}
                      type="button"
                    >
                      다시 시도
                    </button>
                  )}
                  {reviewRequest.can_cancel && (
                    <button
                      className="btn btn-secondary"
                      disabled={isToolWorking}
                      onClick={cancelRoomReview}
                      type="button"
                    >
                      취소
                    </button>
                  )}
                </div>
              )}
            </section>
          )}
          <section className="chat-section" aria-label="대국 기록">
            <h1 className="sr-only">대국방</h1>
            <div className="chat-container">
              {messages.length === 0 ? (
                <div className="chat-empty">
                  <p>아직 확정된 대화가 없어요.</p>
                  <p className="hint">
                    첫 메시지는 AI 심판을 거친 뒤 두 사람에게 같은 순서로
                    표시됩니다.
                  </p>
                </div>
              ) : (
                messages.map((message) => {
                  const sender = members.find(
                    (member) =>
                      member.public_member_key === message.sender_member_key,
                  );
                  const isRight = sender?.role === "creator";
                  return (
                    <article
                      className={`msg-bubble ${isRight ? "msg-right" : "msg-left"}`}
                      key={message.id}
                    >
                      <p className="msg-sender">
                        {sender?.room_display_name ?? "참여자"}
                      </p>
                      <p>{message.body}</p>
                    </article>
                  );
                })
              )}
            </div>
          </section>
          <section className="chat-bottom" aria-label="대국 도구와 메시지 초안">
            <div className="chat-tools">
              <button
                className="btn btn-sm btn-secondary"
                disabled={isToolWorking || room.status !== "active"}
                onClick={requestPosition}
                type="button"
              >
                📊 형세 파악
              </button>
              <button
                className="btn btn-sm btn-secondary"
                disabled={
                  isToolWorking ||
                  room.status !== "active" ||
                  members.length < 2 ||
                  Boolean(
                    reviewRequest &&
                    ["pending", "processing"].includes(reviewRequest.status),
                  )
                }
                onClick={
                  roomReview
                    ? () => setIsRoomReviewOpen(true)
                    : requestRoomReview
                }
                type="button"
              >
                ⚖️ {roomReview ? "AI 문철 확인하기" : "AI 문철 신청하기"}
              </button>
              {latestSettlement && (
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => setIsNegotiationOpen(true)}
                  type="button"
                >
                  🗂 협상 기록
                </button>
              )}
              <button
                className="btn btn-sm btn-outline"
                disabled={
                  room.status !== "active" ||
                  members.length < 2 ||
                  isSettlementWorking ||
                  Boolean(activeOffer)
                }
                onClick={() => setIsNegotiationOpen(true)}
                type="button"
              >
                🤝 무승부 제안
              </button>
            </div>
            <div className="chat-input-row">
              <textarea
                aria-label="메시지 초안"
                onChange={(event) => {
                  setDraft(event.target.value);
                  setJudge(undefined);
                }}
                placeholder="초안 메시지를 입력하세요... (확인을 누르면 AI 심판이 열립니다)"
                rows={2}
                value={draft}
              />
              <button
                className="btn btn-primary chat-confirm-button"
                disabled={
                  isJudging || !draft.trim() || room.status !== "active"
                }
                onClick={requestJudge}
                type="button"
              >
                {isJudging ? "확인 중…" : "확인"}
              </button>
            </div>
            <p className="chat-boundary-note">
              * 초안 작성 후 [확인]을 누르면 AI 심판 시트가 필수 개시됩니다.
              (직접 전송 불가)
            </p>
            {judgeError && <p className="notice">{judgeError}</p>}
            {toolError && <p className="notice">{toolError}</p>}
          </section>
          {judge && (
            <section
              className="sheet-overlay active"
              role="dialog"
              aria-modal="true"
              aria-label="AI 심판 결과"
            >
              <div className="sheet-content">
                <header className="sheet-header">
                  <h2>⚖️ AI 심판 결과</h2>
                  <button
                    className="btn-icon"
                    onClick={() => setJudge(undefined)}
                    type="button"
                    aria-label="닫기"
                  >
                    ✕
                  </button>
                </header>
                <p className="sheet-draft-preview">입력 초안: “{draft}”</p>
                {judge.result.result_type === "restricted" ? (
                  <>
                    <section className="warning-box">
                      <strong>⛔ Restricted AI 분석</strong>
                      <br />
                      {judge.result.risk}
                    </section>
                    <button
                      className="btn btn-primary btn-block"
                      onClick={() => setJudge(undefined)}
                      type="button"
                    >
                      초안 수정하러 가기
                    </button>
                  </>
                ) : (
                  <>
                    <section className="card ai-risk-card">
                      <strong>
                        ⚠️ 이 수의 위험 &amp; 숨은 감정 (AI의 추정)
                      </strong>
                      <p>
                        {judge.result.risk} {judge.result.inference}
                      </p>
                    </section>
                    <p className="section-title sheet-section-title">
                      💡 AI 추천 메시지
                    </p>
                    {judge.result.recommendations.map(
                      (recommendation, index) => (
                        <section
                          className="card recommendation-card"
                          key={`${recommendation.text}-${index}`}
                        >
                          <p>“{recommendation.text}”</p>
                          <button
                            className="btn btn-sm btn-primary btn-block"
                            disabled={isJudging}
                            onClick={() =>
                              void sendChoice("recommendation", index)
                            }
                            type="button"
                          >
                            추천 {index + 1} 전송
                          </button>
                        </section>
                      ),
                    )}
                    <div className="sheet-actions">
                      <button
                        className="btn btn-secondary"
                        onClick={() => setJudge(undefined)}
                        type="button"
                      >
                        초안 수정
                      </button>
                      <button
                        className="btn btn-outline"
                        disabled={isJudging}
                        onClick={() => void sendChoice("original")}
                        type="button"
                      >
                        원문 전송
                      </button>
                    </div>
                  </>
                )}
              </div>
            </section>
          )}
          {position && (
            <section
              className="sheet-overlay active"
              role="dialog"
              aria-modal="true"
              aria-label="개인 형세 파악"
            >
              <div className="sheet-content position-sheet">
                <header className="sheet-header">
                  <h2>📊 개인 형세 파악 (비공개)</h2>
                  <button
                    className="btn-icon"
                    onClick={() => setPosition(undefined)}
                    type="button"
                    aria-label="닫기"
                  >
                    ✕
                  </button>
                </header>
                <section className="notice-box">
                  🔒 본 결과는 요청자 본인에게만 제공되며 상대방에게는 노출되지
                  않습니다.
                </section>
                <section className="card position-summary-card">
                  <div className="position-card-title">
                    <h3>현재 대화 형세</h3>
                    <span>AI의 추정</span>
                  </div>
                  <p className="position-summary-text">
                    {position.current_position}
                  </p>
                </section>
                <section className="card position-issues-card">
                  <div className="position-card-title">
                    <h3>내가 확인할 쟁점</h3>
                    <span>AI의 추정</span>
                  </div>
                  <ul className="position-issues-list">
                    {position.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </section>
                <section className="card position-next-card">
                  <h3>다음 판단</h3>
                  <p>{position.next_move}</p>
                </section>
                <button
                  className="btn btn-primary btn-block"
                  onClick={() => setPosition(undefined)}
                  type="button"
                >
                  대국방으로 돌아가기
                </button>
              </div>
            </section>
          )}
          {isRoomReviewOpen && roomReview?.result && (
            <section
              className="sheet-overlay active"
              role="dialog"
              aria-modal="true"
              aria-label="AI 문철"
            >
              <div className="sheet-content room-review-sheet">
                {isRoomReviewHistoryOpen ? (
                  <>
                    <header className="sheet-header">
                      <h2>🗂 AI 문철 기록</h2>
                      <button
                        className="btn-icon"
                        onClick={() => setIsRoomReviewHistoryOpen(false)}
                        type="button"
                        aria-label="현재 문철로 돌아가기"
                      >
                        ✕
                      </button>
                    </header>
                    <section className="notice-box">
                      이전 문철은 읽기 전용입니다. 새 대화를 정리하려면 현재
                      문철에서 새 신청을 시작하세요.
                    </section>
                    <div className="room-review-history-list">
                      {previousRoomReviews.map((review, index) => (
                        <button
                          className={`room-review-history-item ${review.id === selectedRoomReviewId ? "is-selected" : ""}`}
                          key={review.id}
                          onClick={() => setSelectedRoomReviewId(review.id)}
                          type="button"
                        >
                          <strong>
                            문철 {previousRoomReviews.length - index}
                          </strong>
                          <span>
                            {new Date(review.created_at).toLocaleString(
                              "ko-KR",
                              {
                                month: "numeric",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}{" "}
                            · 읽기 전용
                          </span>
                        </button>
                      ))}
                    </div>
                    {selectedHistoricalReview && (
                      <section className="room-review-record">
                        <section className="card room-review-summary-card">
                          <h3>함께 확인한 대화 요약</h3>
                          <p>{selectedHistoricalReview.result.summary}</p>
                        </section>
                        <section className="card">
                          <h3>서로 다른 지점</h3>
                          <ul className="room-review-list">
                            {selectedHistoricalReview.result.different_points.map(
                              (point) => (
                                <li key={point}>{point}</li>
                              ),
                            )}
                          </ul>
                        </section>
                        <section className="card">
                          <div className="position-card-title">
                            <h3>바람과 걱정</h3>
                            <span>AI의 추정</span>
                          </div>
                          <ul className="room-review-list">
                            {selectedHistoricalReview.result.wishes_and_worries.map(
                              (item) => (
                                <li key={item}>{item}</li>
                              ),
                            )}
                          </ul>
                        </section>
                        <section className="card room-review-next-card">
                          <h3>다음 수 제안</h3>
                          <p>{selectedHistoricalReview.result.next_move}</p>
                        </section>
                      </section>
                    )}
                  </>
                ) : (
                  <>
                    <header className="sheet-header">
                      <h2>⚖️ 함께 보는 AI 문철</h2>
                      <button
                        className="btn-icon"
                        onClick={() => setIsRoomReviewOpen(false)}
                        type="button"
                        aria-label="닫기"
                      >
                        ✕
                      </button>
                    </header>
                    <section className="notice-box">
                      🤝 상대 수락 뒤 생성된, 두 멤버가 함께 보는 공용 요약
                      브리핑입니다. 승패를 판정하지 않습니다.
                    </section>
                    <section className="card room-review-summary-card">
                      <h3>함께 확인할 대화 요약</h3>
                      <p>{roomReview.result.summary}</p>
                    </section>
                    <section className="card">
                      <h3>서로 다른 지점</h3>
                      <ul className="room-review-list">
                        {roomReview.result.different_points.map((point) => (
                          <li key={point}>{point}</li>
                        ))}
                      </ul>
                    </section>
                    <section className="card">
                      <div className="position-card-title">
                        <h3>바람과 걱정</h3>
                        <span>AI의 추정</span>
                      </div>
                      <ul className="room-review-list">
                        {roomReview.result.wishes_and_worries.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </section>
                    <section className="card room-review-next-card">
                      <h3>다음 수 제안</h3>
                      <p>{roomReview.result.next_move}</p>
                    </section>
                    <div className="sheet-actions">
                      <button
                        className="btn btn-secondary"
                        onClick={() => setIsRoomReviewOpen(false)}
                        type="button"
                      >
                        대국방으로
                      </button>
                      <button
                        className="btn btn-outline"
                        onClick={() => {
                          setIsRoomReviewOpen(false);
                          setIsNegotiationOpen(true);
                        }}
                        type="button"
                      >
                        무승부 제안
                      </button>
                    </div>
                    <button
                      className="btn btn-outline btn-block room-review-secondary-action"
                      disabled={
                        isToolWorking ||
                        room.status !== "active" ||
                        Boolean(
                          reviewRequest &&
                          ["pending", "processing"].includes(
                            reviewRequest.status,
                          ),
                        )
                      }
                      onClick={() => {
                        setIsRoomReviewOpen(false);
                        void requestRoomReview();
                      }}
                      type="button"
                    >
                      새 AI 문철 신청하기
                    </button>
                    {previousRoomReviews.length > 0 && (
                      <button
                        className="btn btn-outline btn-block room-review-secondary-action"
                        onClick={() => {
                          setSelectedRoomReviewId(previousRoomReviews[0].id);
                          setIsRoomReviewHistoryOpen(true);
                        }}
                        type="button"
                      >
                        🗂 이전 AI 문철 기록 보기
                      </button>
                    )}
                  </>
                )}
              </div>
            </section>
          )}
          {isNegotiationOpen && (
            <section
              className="sheet-overlay active negotiation-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="조건부 무승부 협상"
            >
              <div className="sheet-content negotiation-sheet">
                <button
                  className="btn-icon negotiation-close"
                  onClick={() => setIsNegotiationOpen(false)}
                  type="button"
                  aria-label="대국방으로 돌아가기"
                >
                  ✕
                </button>
                <NegotiationPanel
                  counter={activeCounter}
                  error={settlementError}
                  history={settlementOffers}
                  myMemberKey={myMemberKey}
                  offer={activeOffer}
                  onAccept={(termIds) => void acceptSettlement(termIds)}
                  onBack={() => setIsNegotiationOpen(false)}
                  onContinue={() => void continueSettlement()}
                  onCounter={(body) => void counterSettlement(body)}
                  onCreate={(selectionMode, terms) =>
                    void createSettlement(selectionMode, terms)
                  }
                  terms={activeTerms}
                  working={isSettlementWorking}
                />
              </div>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}

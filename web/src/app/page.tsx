export default function Home() {
  return (
    <main className="min-h-screen bg-stone-950 px-6 py-16 text-stone-50">
      <section className="mx-auto max-w-2xl space-y-8">
        <p className="text-sm font-medium tracking-[0.2em] text-amber-300">
          MVP FOUNDATION
        </p>
        <div className="space-y-3">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            커플들이 집착하는
            <br />
            AI 심판이 되었다
          </h1>
          <p className="max-w-xl text-lg leading-8 text-stone-300">
            대국방, AI 심판, 무승부 협상과 미션을 위한 프로젝트 뼈대가 준비되었습니다.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            "Next.js 앱과 TypeScript",
            "Supabase 인증·데이터·실시간 경계",
            "OpenAI 서버 전용 호출 경계",
            "Vercel 배포 기준",
          ].map((item) => (
            <li
              className="rounded-xl border border-stone-700 bg-stone-900 px-4 py-3 text-sm text-stone-200"
              key={item}
            >
              {item}
            </li>
          ))}
        </ul>
        <p className="text-sm text-stone-400">
          다음 구현 단계에서 로그인·초대·대국방 기능을 연결합니다.
        </p>
      </section>
    </main>
  );
}

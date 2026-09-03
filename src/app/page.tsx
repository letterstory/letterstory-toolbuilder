import styles from "./page.module.css";
import { getPlatformScaffoldStatus } from "@/lib/platform/status";

const status = getPlatformScaffoldStatus();

export default function Home() {
	return (
		<div className={styles.page}>
			<main className={styles.main}>
				<section className={styles.hero}>
					<p className={styles.eyebrow}>Phase 1 · Free Tool Generation</p>
					<h1>Hosted, brand-aware micro-tool generation starts here.</h1>
					<p className={styles.description}>
						This scaffold separates brand ingestion, generation orchestration, and deployment
						boundaries so the real integrations can land behind clear contracts.
					</p>
				</section>

				<section className={styles.grid}>
					{status.modules.map((module) => (
						<article key={module.name} className={styles.card}>
							<div className={styles.cardHeader}>
								<h2>{module.name}</h2>
								<span data-state={module.state} className={styles.badge}>
									{module.state}
								</span>
							</div>
							<p>{module.summary}</p>
							<ul>
								{module.nextSteps.map((step) => (
									<li key={step}>{step}</li>
								))}
							</ul>
						</article>
					))}
				</section>

				<section className={styles.footerCard}>
					<h2>Included today</h2>
					<p>
						A working Next.js 15 app, strict TypeScript, lint/test/build scripts, config-gated
						backend stubs, and a health endpoint for local smoke checks.
					</p>
					<code className={styles.code}>GET /api/health</code>
				</section>
			</main>
		</div>
	);
}

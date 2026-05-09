import { listScenarios } from "../src/scenarios/index";
import { Nav } from "../components/nav";
import { Hero } from "../components/hero";
import { StatusStrip } from "../components/status-strip";
import { HowItWorks } from "../components/how-it-works";
import { ScenariosGrid } from "../components/scenarios-grid";
import { TribunalSection } from "../components/tribunal-section";
import { TrustStrip } from "../components/trust-strip";
import { FinalCta } from "../components/final-cta";
import { Footer } from "../components/footer";

export default function HomePage() {
  const scenarioCount = listScenarios().length;

  return (
    <>
      <Nav />
      <main>
        <Hero scenarioCount={scenarioCount} />
        <StatusStrip />
        <HowItWorks />
        <ScenariosGrid />
        <TribunalSection />
        <TrustStrip />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}

/**
 * Shared About page content. Used by both desktop (About.jsx) and mobile (MobileAbout.jsx).
 * Layout and styling are handled by the parent; this component is content-only.
 */
function AboutContent() {
  return (
    <>
      <h1>Morsor</h1>
      <p>A list of lists navigator</p>
      <h2>Why?</h2>
      <p>
        The REAL goal: Vibe-code the whole thing. This is an experiment: 99.999% vibe-coding a nontrivial app from scratch.
      </p>
      <p>But, as for what the app DOES:</p>
      <p>
        I&apos;m a list-maker. I have a few dozen lists which I want to be able to easily browse, search
        and do some analysis on. That&apos;s what Morsor's for.
      </p>
      <h2>Features</h2>
      <ul>
        <li>Search all troves (that&apos;s what I call a list), or a subset of troves.</li>
        <li>
          Find duplicate items (or, near-duplicates) across troves.
          <ul>
            <li>
              Example: I&apos;ve got a couple troves: a list of movie favorites, and a list of
              movies which are available on Kanopy. Find stuff I like which is available on Kanopy.
            </li>
          </ul>
        </li>
        <li>
          Conversely, find unique items within a trove, with respect to other troves.
          <ul>
            <li>
              Example: Same troves as the previous example. Find movies which I like but which
              I can&apos;t get on Kanopy. Then I can rent or buy those movies instead of getting
              them for free on Kanopy.
            </li>
          </ul>
        </li>
      </ul>
      <h2>Where do I get the data?</h2>
      <p>That&apos;s another story. Short answer: scripts and manual slogging.</p>
      <h2>What&apos;s with the name?</h2>
      <ul>
        <li>This is a re-write of a previous app I built, called Moocho.me.</li>
        <li>I like Walruses.</li>
        <li>I speak Spanish.</li>
        <li>Morsa is Walrus in Spanish.</li>
        <li>Moocho and Morsa both start with M.</li>
        <li>I used Cursor for this.</li>
        <li>Morsa + Cursor = Morsor.</li>
        <li>I like Lord of the Rings. If you do too you know what Mordor is.</li>
        <li>There is a distance of 1 between Mordor and Morsor in two pretty basic measurements, which is not super relevant but I think it's neato:</li>
        <ul>
          <li>Levenshtein</li>
          <li>Between keys on most keyboards</li>
        </ul>
      </ul>
    </>
  )
}

export default AboutContent

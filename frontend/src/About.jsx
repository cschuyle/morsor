import { Link } from 'react-router-dom'
import './App.css'

function About() {
  return (
    <>
      <div className="about-page">
        <article className="about-content">
          <h1>Morsor</h1>
          <p>A list of lists navigator</p>
          <h2>Why?</h2>
          <p>
            The REAL goal: Vibe-code the whole thing. This is my first experience vibe-coding.
          </p>
          <p>But, as for what the app DOES:</p>
          <p>
            I&apos;m a list-maker. I have a few dozen lists which I want to be able to easily browse, search
            and do some analysis on. That&apos;s what the app does.
          </p>
          <h2>What&apos;s the name?</h2>
          <p>This is a re-write of a previous app I built, called Moocho.me.</p>
          <p>I like Walruses.</p>
          <p>I speak Spanish.</p>
          <p>Morsa is Walrus in Spanish.</p>
          <p>Moocho and Morsa both start with M.</p>
          <p>I used Cursor for this.</p>
          <p>Morsa + Cursor = Morsor.</p>
          <p>I like Lord of the Rings. If you do too you know what Mordor is.</p>
          <p>
            There is a distance of 1 between Mordor and Morsor in two pretty basic measurements:
          </p>
          <ul>
            <li>Levenshtein</li>
            <li>Between keys on most keyboards</li>
          </ul>
          <h1>Features</h1>
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
        </article>
      </div>
      <hr className="backend-status-divider" />
      <footer className="app-footer">
        <Link to="/" className="app-footer-link">Go back</Link>
      </footer>
    </>
  )
}

export default About

import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import NavBar from '../components/NavBar';

export default function Home() {
  const { isAuthenticated } = useAuth();

  return (
    <>
      <NavBar />
      <div className="home">
        <h1 className="home-headline">
          <span className="headline-brand">Bupis</span> is coming to <em>your stack</em>.
          <br />
          Listening with a durable log &amp;
          <br />
          turning raw streams <em>into answers</em>
          <br />
          in a realtime residency at
          <br />
          the events auditorium.
        </h1>

        <p className="kicker">every event · every service · every day</p>
        <div className="home-dates">TRACK — REPLAY — SUBSCRIBE</div>
        <p className="home-dates-sub">+ live dashboards &nbsp;·&nbsp; psychic hotline for your data</p>

        <hr className="rule rule--faint" />

        <p className="home-invite">
          Your services will be <em>learning together</em>,<br />
          and you are invited.
        </p>

        <div className="home-cta-row">
          <Link className="btn btn--solid" to={isAuthenticated ? '/dashboard' : '/login'}>
            {isAuthenticated ? 'Open dashboard' : 'Get started'}
          </Link>
          <a className="btn" href="http://localhost:4000/graphql" target="_blank" rel="noreferrer">
            Explore the API
          </a>
        </div>

        <hr className="rule" />

        <div className="home-features" id="features">
          <div className="feature">
            <h3>Fire &amp; forget</h3>
            <p>
              One mutation and you're done — events land on a durable Kafka log and your caller
              never waits on processing.
            </p>
          </div>
          <div className="feature">
            <h3>Replayable</h3>
            <p>
              The log is the source of truth. Fix a bug, change a metric, and replay history like
              it never happened wrong.
            </p>
          </div>
          <div className="feature">
            <h3>Live</h3>
            <p>
              Subscriptions push every event to your dashboard the moment it clears the pipeline.
              No refresh button.
            </p>
          </div>
        </div>

        <hr className="rule rule--faint" />

        <footer className="home-footer">
          <p className="kicker">
            you are a <span style={{ fontSize: '13px' }}>very special guest</span>{' '}
            <span className="kicker-lower">and are</span>
          </p>
          <p className="welcome">
            WELCOME
            <br />
            TO HAVE A GOOD TIME <span className="infinity">∞</span>
          </p>
        </footer>
      </div>
    </>
  );
}

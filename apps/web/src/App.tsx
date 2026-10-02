import './index.css';
import { Router } from './router';

const App = () => {
  return (
    <Router>
      {(props) => (
        <>
          <h1 class="sr-only">Solid Surreal Starter</h1>
          {props.children}
        </>
      )}
    </Router>
  );
};

export default App;

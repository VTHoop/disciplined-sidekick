import { Link } from "react-router";
import type { FoodApi } from "../food/food-api";
import { FoodLog } from "../food/food-log";
import { useAuth } from "./auth-context";

/** Today: for now, the food log. The day's totals and entries come later. */
export function TodayScreen({ food }: { food: FoodApi }) {
  const { signOut } = useAuth();
  return (
    <main>
      <h1>Today</h1>
      <FoodLog api={food} />
      <p>
        <Link to="/settings">Settings</Link>
      </p>
      <button type="button" onClick={signOut}>
        Sign out
      </button>
    </main>
  );
}

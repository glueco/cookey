import { redirect } from "next/navigation";

// The dashboard monolith was replaced by the (admin) layout group.
// Old links and the login flow land here; send them to Overview.
export default function DashboardRedirect() {
  redirect("/overview");
}

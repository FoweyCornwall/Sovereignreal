import { AuthForm } from "@/components/auth/AuthForm";
import { signUp } from "@/lib/actions/auth";

export default function SignupPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <AuthForm mode="signup" action={signUp} />
    </div>
  );
}

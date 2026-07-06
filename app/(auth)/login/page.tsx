import { AuthForm } from "@/components/auth/AuthForm";
import { signIn } from "@/lib/actions/auth";

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <AuthForm mode="login" action={signIn} />
    </div>
  );
}

import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertUserSchema } from "@shared/schema";
import { Redirect } from "wouter";
import { Loader2 } from "lucide-react";
import { z } from "zod";

export default function AuthPage() {
  const { user, loginMutation, registerMutation, isLoading } = useAuth();
  const { t, language, setLanguage } = useLanguage();

  // Login form validation schema
  const loginSchema = insertUserSchema
    .pick({ username: true, password: true })
    .extend({
      username: z.string().min(1, t('auth.errors.usernameRequired')),
      password: z.string().min(1, t('auth.errors.passwordRequired')),
    });

  // Register form validation schema
  const registerSchema = insertUserSchema.extend({
    username: z.string().min(1, t('auth.errors.usernameRequired')),
    password: z.string().min(6, t('auth.errors.passwordLength')),
    email: z.string().email(t('auth.errors.invalidEmail')),
    phone: z.string().min(1, t('auth.errors.phoneRequired')),
  });

  const loginForm = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: ""
    }
  });

  const registerForm = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      phone: "",
      username: "",
      password: "",
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Redirect to="/" />;
  }

  return (
    <div className="min-h-screen bg-gray-900 flex">
      <div className="flex-1 flex items-center justify-center">
        <Card className="w-[400px]">
          <div className="p-4 flex justify-end">
            <Select 
              value={language} 
              onValueChange={(value) => setLanguage(value as 'en' | 'tr')}
            >
              <SelectTrigger className="w-24">
                <SelectValue placeholder={t('language.select')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="tr">Türkçe</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">{t('auth.login')}</TabsTrigger>
              <TabsTrigger value="register">{t('auth.register')}</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <CardContent className="pt-6">
                <form 
                  onSubmit={loginForm.handleSubmit((data) => {
                    loginMutation.mutate({
                      username: data.username,
                      password: data.password,
                    });
                  })}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="username">{t('auth.username')}</Label>
                    <Input 
                      id="username" 
                      {...loginForm.register("username")}
                      disabled={loginMutation.isPending}
                    />
                    {loginForm.formState.errors.username && (
                      <p className="text-sm text-destructive">
                        {loginForm.formState.errors.username.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">{t('auth.password')}</Label>
                    <Input 
                      id="password" 
                      type="password" 
                      {...loginForm.register("password")}
                      disabled={loginMutation.isPending}
                    />
                    {loginForm.formState.errors.password && (
                      <p className="text-sm text-destructive">
                        {loginForm.formState.errors.password.message}
                      </p>
                    )}
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    {t('auth.login')}
                  </Button>
                  {loginMutation.isError && (
                    <p className="text-sm text-destructive text-center">
                      {t('auth.errors.loginFailed')}
                    </p>
                  )}
                </form>
              </CardContent>
            </TabsContent>

            <TabsContent value="register">
              <CardContent className="pt-6">
                <form 
                  onSubmit={registerForm.handleSubmit((data) => registerMutation.mutate(data))}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="reg-username">{t('auth.username')}</Label>
                    <Input 
                      id="reg-username" 
                      {...registerForm.register("username")}
                      disabled={registerMutation.isPending}
                    />
                    {registerForm.formState.errors.username && (
                      <p className="text-sm text-destructive">
                        {registerForm.formState.errors.username.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-email">Email</Label>
                    <Input 
                      id="reg-email" 
                      type="email" 
                      {...registerForm.register("email")}
                      disabled={registerMutation.isPending}
                    />
                    {registerForm.formState.errors.email && (
                      <p className="text-sm text-destructive">
                        {registerForm.formState.errors.email.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-phone">{t('auth.phone')}</Label>
                    <Input 
                      id="reg-phone" 
                      {...registerForm.register("phone")}
                      disabled={registerMutation.isPending}
                    />
                    {registerForm.formState.errors.phone && (
                      <p className="text-sm text-destructive">
                        {registerForm.formState.errors.phone.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-password">{t('auth.password')}</Label>
                    <Input 
                      id="reg-password" 
                      type="password" 
                      {...registerForm.register("password")}
                      disabled={registerMutation.isPending}
                    />
                    {registerForm.formState.errors.password && (
                      <p className="text-sm text-destructive">
                        {registerForm.formState.errors.password.message}
                      </p>
                    )}
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={registerMutation.isPending}
                  >
                    {registerMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    {t('auth.register')}
                  </Button>
                  {registerMutation.isError && (
                    <p className="text-sm text-destructive text-center">
                      {t('auth.errors.registrationFailed')}
                    </p>
                  )}
                </form>
              </CardContent>
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      <div className="hidden lg:flex flex-1 items-center justify-center bg-gray-800 p-12">
        <div className="max-w-lg">
          <h1 className="text-4xl font-bold text-white mb-6">
            {t('auth.welcomeTitle')}
          </h1>
          <p className="text-gray-300 text-lg">
            {t('auth.welcomeDescription')}
          </p>
        </div>
      </div>
    </div>
  );
}
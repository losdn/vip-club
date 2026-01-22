import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md bg-card border-border">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <h1 className="text-2xl font-bold text-white">404 Página Não Encontrada</h1>
          </div>

          <p className="mt-4 text-muted-foreground">
            A página que você está procurando não existe ou você não tem permissão para visualizá-la.
          </p>

          <div className="mt-6">
            <Link href="/">
              <Button className="w-full bg-primary hover:bg-primary/90 text-white">
                Voltar para o Início
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

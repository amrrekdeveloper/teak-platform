/**
 * Kitchen Designer V2 — experimental entry page.
 * Route: /kitchen-designer-v2 (fully isolated from V1 /kitchen-designer).
 */
import { Link } from "wouter";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FlaskConical, Ruler, Box, ArrowLeft } from "lucide-react";
import { useKitchenToolV2Store } from "@/components/kitchen-tool-v2/store";
import { V2Gate } from "@/components/kitchen-tool-v2/v2-gate";

export default function KitchenToolV2LandingPage() {
  return (
    <V2Gate>
      <KitchenToolV2LandingInner />
    </V2Gate>
  );
}

function KitchenToolV2LandingInner() {
  const { t, lang } = useLanguage();
  const room = useKitchenToolV2Store((s) => s.room);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4" dir={lang === "ar" ? "rtl" : "ltr"}>
      <Card className="max-w-lg w-full">
        <CardContent className="p-8 text-center space-y-5">
          <div className="flex items-center justify-center gap-2">
            <FlaskConical className="w-8 h-8 text-primary" />
            <Badge variant="outline">{t("تجريبي", "Experimental")}</Badge>
          </div>
          <h1 className="text-2xl font-bold" data-testid="text-v2-landing-title">
            {t("صمم مطبخك 2", "Design Your Kitchen 2")}
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {t(
              "نسخة تجريبية معزولة تماماً عن أداة التصميم الحالية. في هذه المرحلة: اختيار شكل الغرفة، إدخال الأبعاد، ومعاينة غرفة ثلاثية الأبعاد فارغة.",
              "An experimental version fully isolated from the current designer. This phase: choose a layout, enter dimensions, and preview an empty 3D room."
            )}
          </p>
          <div className="flex flex-col gap-3">
            <Link href="/kitchen-designer-v2/space">
              <Button size="lg" className="w-full gap-2" data-testid="button-v2-start">
                <Ruler className="w-5 h-5" />
                {t("إدخال مساحة الغرفة", "Enter Room Space")}
                <ArrowLeft className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
              </Button>
            </Link>
            {room && (
              <Link href="/kitchen-designer-v2/room-preview">
                <Button size="lg" variant="outline" className="w-full gap-2" data-testid="button-v2-continue-preview">
                  <Box className="w-5 h-5" />
                  {t("متابعة المعاينة المحفوظة", "Continue Saved Preview")}
                </Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { LifeBuoy, BookOpen, Mail, ShieldCheck, CreditCard } from 'lucide-react';
import { PageHeader } from '@/components/data/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const LINKS: { title: string; desc: string; icon: typeof LifeBuoy }[] = [
  { title: 'מדריך התחלה מהירה', desc: 'הקמת סניף, מחשבים, לקוחות ופתיחת שימוש ראשון.', icon: BookOpen },
  { title: 'רמות משתמש והרשאות', desc: 'הגדרת "מחשב בלבד", "אימייל בלבד", חסימת וידאו והרשאות עובדים.', icon: ShieldCheck },
  { title: 'סליקת אשראי (נדרים פלוס)', desc: 'חיבור מסוף הסליקה, תשלום חד־פעמי והוראת קבע.', icon: CreditCard },
];

export default function SupportPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="תמיכה ועזרה" subtitle="מדריכים, שאלות נפוצות ופנייה לצוות" />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {LINKS.map((l) => (
          <Card key={l.title}>
            <CardContent className="flex flex-col gap-2 p-5">
              <l.icon className="h-6 w-6 text-primary" aria-hidden />
              <span className="font-semibold">{l.title}</span>
              <span className="text-sm text-muted-foreground">{l.desc}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" aria-hidden />
            צריך עזרה נוספת?
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>צוות התמיכה זמין לכל שאלה על המערכת, הגדרות, סליקה ותקלות.</p>
          <p>
            דוא"ל תמיכה:{' '}
            <a className="text-primary hover:underline" href="mailto:support@crm.local">
              support@crm.local
            </a>
          </p>
          <p>בכל פנייה נא לציין את שם העסק ואת הסניף הרלוונטי כדי שנוכל לעזור מהר יותר.</p>
        </CardContent>
      </Card>
    </div>
  );
}

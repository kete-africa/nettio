import { defineEmailTemplate } from '@kete/notify';
import { Body, Container, Head, Html, Text } from '@react-email/components';
import * as m from '@/paraglide/messages.js';
import type { StatementMail } from '../sending';

// Kete's colours (@kete/design, design `kete`): e-mail clients need inline styles, so the few that
// matter are repeated here.
const colors = { primary: '#b8321f', text: '#2a1d16', muted: '#6b5a4e', paper: '#fbf8f4' };

/** The evening statement by e-mail: the laundry's name, the day, one fact per line. */
export const statementEmail = defineEmailTemplate<StatementMail>({
  name: 'evening-statement',
  render: (values) => {
    const locale = values.language;
    return {
      subject: m.statement_mail_subject({ business: values.business, day: values.day }, { locale }),
      body: (
        <Html lang={locale}>
          <Head />
          <Body style={{ backgroundColor: colors.paper, fontFamily: 'Arial, sans-serif' }}>
            <Container style={{ maxWidth: '560px', padding: '24px', color: colors.text }}>
              <Text style={{ fontSize: '20px', fontWeight: 700, color: colors.primary, margin: 0 }}>
                {values.business}
              </Text>
              <Text style={{ fontSize: '14px', color: colors.muted, marginTop: '4px' }}>
                {m.statement_mail_day({ day: values.day }, { locale })}
              </Text>
              {values.lines.map((line) => (
                <Text key={line} style={{ fontSize: '16px', lineHeight: '24px', margin: '10px 0' }}>
                  {line}
                </Text>
              ))}
              <Text style={{ fontSize: '12px', color: colors.muted, marginTop: '32px' }}>
                {m.statement_mail_footer({}, { locale })}
              </Text>
            </Container>
          </Body>
        </Html>
      ),
    };
  },
});

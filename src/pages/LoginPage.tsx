import { useRef, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Center } from '@astryxdesign/core/Center';
import { Spinner } from '@astryxdesign/core/Spinner';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import {
  fetchUserProfile,
  pollForAccessToken,
  requestDeviceCode,
  resolveEndpoints,
  type DeviceCodeResponse,
  type GitHubEndpoints,
} from '../lib/github';
import { useAppStore } from '../lib/store';
import { Divider } from '@astryxdesign/core';
import gisterIcon from '../assets/gister-icon.png';

const DEFAULT_CLIENT_ID = (import.meta.env.VITE_GITHUB_CLIENT_ID as string | undefined) ?? '';

export type LoginPhase =
  | { name: 'idle' }
  | { name: 'starting' }
  | { name: 'awaiting-approval'; device: DeviceCodeResponse }
  | { name: 'finishing' };

export interface LoginPageProps {
  /** Dev-only: force an initial phase to preview a specific visual state. */
  initialPhase?: LoginPhase;
}

export function LoginPage({ initialPhase }: LoginPageProps = {}) {
  const completeLogin = useAppStore((s) => s.completeLogin);
  const [clientId, setClientId] = useState(DEFAULT_CLIENT_ID);
  const [enterpriseHost, setEnterpriseHost] = useState('');
  const [isEnterpriseVisible, setIsEnterpriseVisible] = useState(false);
  const [phase, setPhase] = useState<LoginPhase>(initialPhase ?? { name: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const startLogin = async () => {
    setError(null);
    cancelledRef.current = false;
    let endpoints: GitHubEndpoints;
    try {
      endpoints = resolveEndpoints(enterpriseHost);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    setPhase({ name: 'starting' });
    try {
      const device = await requestDeviceCode(endpoints, clientId.trim());
      setPhase({ name: 'awaiting-approval', device });
      openUrl(device.verification_uri);
      await pollUntilDone(endpoints, device);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase({ name: 'idle' });
    }
  };

  const pollUntilDone = async (endpoints: GitHubEndpoints, device: DeviceCodeResponse) => {
    const deadline = Date.now() + device.expires_in * 1000;
    let intervalMs = Math.max(device.interval, 5) * 1000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      if (cancelledRef.current) return;
      const result = await pollForAccessToken(endpoints, clientId.trim(), device.device_code);
      switch (result.status) {
        case 'success': {
          setPhase({ name: 'finishing' });
          // Fetch the profile before storing auth state, so the main page
          // has account info the moment the app switches to it.
          const profile = await fetchUserProfile(endpoints, result.accessToken);
          await completeLogin({
            token: result.accessToken,
            profile,
            enterpriseHost: enterpriseHost.trim(),
            clientId: clientId.trim(),
          });
          return;
        }
        case 'slow_down':
          intervalMs = result.interval * 1000;
          break;
        case 'expired':
          throw new Error('The device code expired. Please try again.');
        case 'denied':
          throw new Error('Authorization was denied on GitHub.');
        case 'pending':
          break;
      }
    }
    throw new Error('The device code expired. Please try again.');
  };

  const cancelLogin = () => {
    cancelledRef.current = true;
    setPhase({ name: 'idle' });
  };

  const isBusy = phase.name === 'starting' || phase.name === 'finishing';

  return (
    <Center axis="both" height="100%">
      <div style={{ width: 400 }}>
        <VStack gap={3} align="stretch">
          <VStack gap={0.5} align="center">
            <img
              src={gisterIcon}
              alt="Gister"
              width={96}
              height={96}
              style={{ borderRadius: 20 }}
            />
            <Text type="display-3" as="div">
              Gister
            </Text>
            <Text type="supporting" color="secondary" as="div">
              Local-first GitHub Gist manager
            </Text>
          </VStack>

          <Card padding={4}>
            <VStack gap={3} align="stretch">
              {error && <Banner status="error" title={error} />}

              {phase.name === 'awaiting-approval' ? (
                <VStack gap={3} align="center">
                  <Text type="body" color="secondary" as="p">
                    Enter this code on GitHub to authorize Gister:
                  </Text>
                  <Text type="code" style={{
                    fontSize: '1.7rem',
                  }}>
                    {phase.device.user_code}
                  </Text>
                  <VStack gap={1.5} align="stretch">
                    <Button
                      label="Copy code"
                      variant="secondary"
                      clickAction={async () => {
                        await navigator.clipboard.writeText(phase.device.user_code);
                      }}
                    />
                    <Button
                      label="Open GitHub again"
                      variant="ghost"
                      clickAction={() => openUrl(phase.device.verification_uri)}
                    />
                    <Button label="Cancel" variant="ghost" onClick={cancelLogin} />
                  </VStack>
                  <Spinner size='sm' label="Waiting for authorization…" style={{
                    display: 'flex',
                    justifyContent: 'center',
                    flexDirection: 'row',
                  }} />
                </VStack>
              ) : (
                <VStack gap={3} align="stretch">
                  <Button
                    label={phase.name === 'finishing' ? 'Signing in…' : 'Sign in with GitHub'}
                    variant="primary"
                    size="lg"
                    isLoading={isBusy}
                    isDisabled={!clientId.trim()}
                    clickAction={startLogin}
                  />
                  {!clientId.trim() && (
                    <Text type="supporting" color="secondary" as="p">
                      Set a GitHub OAuth client ID below (or via VITE_GITHUB_CLIENT_ID) to sign in.
                    </Text>
                  )}
                  <Divider
                    label="Or setup GitHub Enterprise"
                    onClick={() => setIsEnterpriseVisible((prev) => !prev)}
                    style={{
                      cursor: 'pointer',
                    }}
                  />
                  {isEnterpriseVisible && (
                    <VStack gap={2} align="stretch">
                      <TextInput
                        label="OAuth client ID"
                        value={clientId}
                        onChange={setClientId}
                        placeholder="Iv1.abc123…"
                        description="Device Flow must be enabled for this OAuth app."
                      />
                      <TextInput
                        label="GitHub Enterprise host"
                        value={enterpriseHost}
                        onChange={setEnterpriseHost}
                        isOptional
                        placeholder="github.mycompany.com"
                        description="Leave empty for github.com. Saved locally."
                      />
                    </VStack>
                  )}
                </VStack>
              )}
            </VStack>
          </Card>
        </VStack>
      </div>
    </Center>
  );
}

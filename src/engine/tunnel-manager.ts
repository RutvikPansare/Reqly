import localtunnel from 'localtunnel';

export class TunnelManager {
  private tunnel: localtunnel.Tunnel | null = null;

  async start(port: number): Promise<string> {
    if (this.tunnel) {
      this.tunnel.close();
    }
    
    // We request a subdomain, but it's not guaranteed. localtunnel handles the generation.
    this.tunnel = await localtunnel({ port });
    
    this.tunnel.on('close', () => {
      this.tunnel = null;
    });

    return this.tunnel.url;
  }

  stop() {
    if (this.tunnel) {
      this.tunnel.close();
      this.tunnel = null;
    }
  }

  getStatus() {
    return {
      active: !!this.tunnel,
      url: this.tunnel?.url
    };
  }
}

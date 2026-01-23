import { Agent, ProxyAgent, Dispatcher } from 'undici'
import { Readable } from 'stream'

export class HookAgent extends Agent {
  dispatch(options: Agent.DispatchOptions, handler: Dispatcher.DispatchHandler) {
    const method = (options.method || 'GET').toUpperCase()

    // 只处理有 body 的方法
    if (method !== 'GET' && method !== 'HEAD') {
      if (typeof options.body === 'string' || Buffer.isBuffer(options.body) || options.body instanceof Uint8Array) {
        const content = options.body.toString()
        const modified = this.modifyContent(content)

        if (modified !== content) {
          options.body = modified
          options.headers = {
            ...(options.headers || {}),
            'content-length': Buffer.byteLength(modified).toString(),
          }
        }
      }
    }

    return super.dispatch(options, handler)
  }

  protected modifyContent(content: string): string {
    // 默认不修改，子类可以覆盖
    return content
  }
}

export class HookProxyAgent extends ProxyAgent {
  dispatch(options: Agent.DispatchOptions, handler: Dispatcher.DispatchHandler) {
    const method = (options.method || 'GET').toUpperCase()

    if (method === 'POST' && options.body) {
      options.body = this.transformBody(options.body)

      // 删除 Content-Length，HTTP 会自动使用 chunked 编码
      const headers = { ...(options.headers || {}) } as Record<string, string>
      delete headers['content-length']
      delete headers['Content-Length']
      options.headers = headers
    }

    return super.dispatch(options, handler)
  }

  private transformBody(body: Dispatcher.DispatchOptions['body']): Dispatcher.DispatchOptions['body'] {
    // string/Buffer/Uint8Array 直接修改
    if (typeof body === 'string' || Buffer.isBuffer(body) || body instanceof Uint8Array) {
      const content = body.toString()
      const modified = this.modifyContent(content)
      return modified
    }
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()

    // 流式 body：转换为 Readable 流
    const self = this
    const generator = async function* () {
      for await (const chunk of body as AsyncIterable<Buffer>) {
        let text;
        const isBUffer = "buffer" in chunk
        if(typeof chunk === 'string') {
          text = chunk;
        } if (isBUffer) {
          text = decoder.decode(chunk);
        }
        // const text = typeof chunk === 'string' ? chunk : chunk.toString()
        if (text) {
          const modified = self.modifyContent(text)
          yield encoder.encode(modified)

        } else {
          yield chunk
        }


      }
    }
    return Readable.from(generator())
  }

  protected modifyContent(content: string): string {
    // 默认不修改，子类可以覆盖
    // 示例：return content.replace('foo', 'bar')
    let jsonObject= null;
    try {
      jsonObject = JSON.parse(content);
      console.log(jsonObject.messages);
      // if ("input" in jsonObject && Array.isArray(jsonObject.input) && jsonObject.input.length > 0) {

      //   jsonObject.input = jsonObject.input.filter(x=>x.type != 'item_reference' || (x.type == 'item_reference' && !x?.id?.startsWith('rs_')))



      // }
    } catch {

    }
    return jsonObject ?JSON.stringify(jsonObject):content
  }
}

import { networkInterfaces } from 'node:os'

/** IPv4 addresses other computers on the network can use to reach this one. */
export function lanAddresses(host: string): string[] {
  if (host !== '0.0.0.0' && host !== '::') {
    return [host]
  }
  return Object.values(networkInterfaces())
    .flat()
    .filter((info) => info !== undefined && info.family === 'IPv4' && !info.internal)
    .map((info) => info!.address)
}

/** net — the client's single connection-management module (ServiceHub +
 *  HttpChannel + ReconnectingSocket). All external service I/O routes here. */
export { ServiceHub } from './ServiceHub';
export { HttpChannel, type ChannelStatus, type RequestOpts } from './HttpChannel';
export { ReconnectingSocket } from './ReconnectingSocket';

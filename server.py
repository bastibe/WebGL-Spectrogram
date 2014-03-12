from tornado.websocket import WebSocketHandler
import numpy as np
from scipy.signal import hann
import json
from pysoundfile import SoundFile
import matplotlib.pyplot as plt
import sys

def spectrogram(filename, nfft=256, overlap=0.5):
    """Calculate a real spectrogram from an audio file

    An audio file will be loaded and cut up into overlapping blocks of
    length `nfft`. The amount of overlap will be `overlap*nfft`. Then,
    calculate a real fourier transform of length `nfft` of every block
    and save the absolute spectrum.

    """
    file = SoundFile(filename)
    sound = file[:].sum(axis=1)
    shift = round(nfft*overlap)
    num_blocks = (len(sound)-nfft)//shift+1
    specs = np.zeros((nfft/2+1, num_blocks), dtype=np.float32)
    window = hann(nfft)
    for idx in range(num_blocks):
        specs[:,idx] = np.abs(np.fft.rfft(sound[idx*shift:idx*shift+nfft]*window, n=nfft))/nfft
    specs[:,-1] = np.abs(np.fft.rfft(sound[num_blocks*shift:], n=nfft))/nfft
    return specs.T, file.sample_rate, len(file)/file.sample_rate

class EchoWebSocket(WebSocketHandler):

    def open(self):
        self.send_message("status", "Server started")
        print("WebSocket opened")

    def send_message(self, type_, content):
        """Send a message.

        Arguments:
        type      the message type as string
        content   the message content as json-serializable data

        """

        self.write_message(json.dumps({ "type": type_,
                                        "content": content }).encode())

    def send_binary_message(self, metadata, data):
        """Send a binary message that consists of three parts:

        - the length of the header as a 32 bit signed integer
        - the header, as utf-8 encoded JSON string
        - the payload, byte-aligned to 8 byte

        Arguments:
        metadata  is a dictionary that will be saved in the header.
        data      is a numpy array that will make up the payload.

        """

        header = json.dumps(metadata).encode()
        # append enough spaces so that the payload starts at an 8-byte
        # aligned position. The first four bytes will be the length of
        # the header, encoded as a 32 bit signed integer:
        header += b' ' * (8-((len(header)+4) % 8))
        # the length of the header as a binary 32 bit signed integer:
        prefix = len(header).to_bytes(4, sys.byteorder)
        payload = data.tostring()
        self.write_message(prefix + header + payload, binary=True)

    def on_message(self, string):
        try:
            message = json.loads(string)
        except ValueError:
            print('message {} is not a valid JSON object'.format(string))

        if message['type'] == 'status':
            print("Status Message:", message['content'])
        elif message['type'] == 'request_spectrogram':
            print('sending spectrogram')
            data, fs, length = spectrogram(**message['content'])
            self.send_binary_message({ 'type': 'spectrogram',
                                       'extent': data.shape,
                                       'fs': fs,
                                       'length': length }, data)

    def on_close(self):
        print("WebSocket closed")


if __name__ == "__main__":
    from tornado.web import Application
    from tornado.ioloop import IOLoop

    app = Application([ ("/websocket", EchoWebSocket) ])

    app.listen(8888)
    IOLoop.instance().start()

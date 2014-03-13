from tornado.websocket import WebSocketHandler
import numpy as np
from scipy.signal import hann
import json
from pysoundfile import SoundFile
import matplotlib.pyplot as plt
import sys
import io

def data_spectrogram(data, nfft=256, overlap=0.5):
    file = SoundFile(io.BytesIO(data), virtual_io=True)
    data = file[:].sum(axis=1)
    return spectrogram(data, file.sample_rate, nfft, overlap)

def file_spectrogram(filename, nfft=256, overlap=0.5):
    """Calculate a real spectrogram from an audio file

    An audio file will be loaded and cut up into overlapping blocks of
    length `nfft`. The amount of overlap will be `overlap*nfft`. Then,
    calculate a real fourier transform of length `nfft` of every block
    and save the absolute spectrum.

    """
    file = SoundFile(filename)
    data = file[:].sum(axis=1)
    return spectrogram(data, file.sample_rate, nfft, overlap)


def spectrogram(data, sample_rate, nfft, overlap):
    shift = round(nfft*overlap)
    num_blocks = (len(data)-nfft)//shift+1
    specs = np.zeros((nfft/2+1, num_blocks), dtype=np.float32)
    window = hann(nfft)
    for idx in range(num_blocks):
        specs[:,idx] = np.abs(np.fft.rfft(data[idx*shift:idx*shift+nfft]*window, n=nfft))/nfft
    specs[:,-1] = np.abs(np.fft.rfft(data[num_blocks*shift:], n=nfft))/nfft
    return specs.T, sample_rate, len(data)/sample_rate


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

    def on_message(self, msg):
        if isinstance(msg, str):
            try:
                header = json.loads(msg)
            except ValueError:
                print('message {} is not a valid JSON object'.format(msg))
        else:
            header_len = int.from_bytes(msg[:4], byteorder=sys.byteorder)
            header = json.loads(msg[4:header_len+4].decode())
            payload = msg[4+header_len:]

        if header['type'] == 'status':
            print("Status Message:", header['content'])
        elif header['type'] == 'request_file_spectrogram':
            data, fs, length = file_spectrogram(**header['content'])
            self.send_binary_message({ 'type': 'spectrogram',
                                       'extent': data.shape,
                                       'fs': fs,
                                       'length': length }, data)
        elif header['type'] == 'request_data_spectrogram':
            data, fs, length = data_spectrogram(payload, **header['content'])
            self.send_binary_message({ 'type': 'spectrogram',
                                       'extent': data.shape,
                                       'fs': fs,
                                       'length': length }, data)
        else:
            print("Don't know what to do with message of type {}".format(header['type']))

    def on_close(self):
        print("WebSocket closed")


if __name__ == "__main__":
    from tornado.web import Application
    from tornado.ioloop import IOLoop

    app = Application([ ("/websocket", EchoWebSocket) ])

    app.listen(8888)
    IOLoop.instance().start()

import json
import sys
import io
import numpy as np
from tornado.websocket import WebSocketHandler
from pysoundfile import SoundFile


def hann(n):
  return 0.5 - 0.5 * np.cos(2.0 * np.pi * np.arange(n) / (n - 1))


class JSONWebSocket(WebSocketHandler):

  """A websocket that sends/receives JSON messages.

  Each message has a type, a content and optional binary data.
  Message type and message content are stored as a JSON object. Type
  must be a string and content must be JSON-serializable.

  If binary data is present, the message will be sent in binary,
  with the first four bytes storing a signed integer containing the
  length of the JSON data, then the JSON data, then the binary data.
  The binary data will be stored 8-byte aligned.

  """

  def open(self):
    print("WebSocket opened")

  def send_message(self, msg_type, content, data=None):
    """Send a message.

    Arguments:
    msg_type  the message type as string.
    content   the message content as json-serializable data.
    data      raw bytes that are appended to the message.

    """

    if data is None:
      self.write_message(json.dumps({"type": msg_type,
                                     "content": content}).encode())
    else:
      header = json.dumps({'type': msg_type,
                           'content': content}).encode()
      # append enough spaces so that the payload starts at an 8-byte
      # aligned position. The first four bytes will be the length of
      # the header, encoded as a 32 bit signed integer:
      header += b' ' * (8 - ((len(header) + 4) % 8))
      # the length of the header as a binary 32 bit signed integer:
      prefix = len(header).to_bytes(4, sys.byteorder)
      self.write_message(prefix + header + data, binary=True)

  def on_message(self, msg):
    """Parses a message

    Each message must contain the message type, the message
    content, and an optional binary payload. The decoded message
    will be forwarded to receive_message().

    Arguments:
    msg       the message, either as str or bytes.

    """

    if isinstance(msg, bytes):
      header_len = int.from_bytes(msg[:4], byteorder=sys.byteorder)
      header = msg[4:header_len + 4].decode()
      data = msg[4 + header_len:]
    else:
      header = msg
      data = None

    try:
      header = json.loads(header)
    except ValueError:
      print('message {} is not a valid JSON object'.format(msg))
      return

    if 'type' not in header:
      print('message {} does not have a "type" field'.format(header))
    elif 'content' not in header:
      print('message {} does not have a "content" field'.format(header))
    else:
      self.receive_message(header['type'], header['content'], data)

  def receive_message(self, msg_type, content, data=None):
    """Message dispatcher.

    This is meant to be overwritten by subclasses. By itself, it
    does nothing but complain.

    """

    if msg_type == "information":
      print(content)
    else:
      print(("Don't know what to do with message of type {}" +
             "and content {}").format(msg_type, content))

  def on_close(self):
    print("WebSocket closed")


class SpectrogramWebSocket(JSONWebSocket):

  """A websocket that sends spectrogram data.

  It calculates a spectrogram with a given FFT length and overlap
  for a requested file. The file can either be supplied as a binary
  data blob, or as a file name.

  This implements two message types:
  - request_file_spectrogram, which needs a filename, and optionally
    `nfft` and `overlap`.
  - request_data_spectrogram, which needs the file as a binary data
    blob, and optionally `nfft` and `overlap`.

  """

  def receive_message(self, msg_type, content, data=None):
    """Message dispatcher.

    Dispatches
    - `request_file_spectrogram` to self.on_file_spectrogram
    - `request_data_spectrogram` to self.on_data_spectrogram

    Arguments:
    msg_type  the message type as string.
    content   the message content as dictionary.
    data      raw bytes.

    """

    if msg_type == 'request_file_spectrogram':
      self.on_file_spectrogram(**content)
    elif msg_type == 'request_data_spectrogram':
      self.on_data_spectrogram(data, **content)
    else:
      super(self.__class__, self).receive_message(msg_type, content, data)

  def on_file_spectrogram(self, filename, nfft=1024, overlap=0.5):
    """Loads an audio file and calculates a spectrogram.

    Arguments:
    filename  the file name from which to load the audio data.
    nfft      the FFT length used for calculating the spectrogram.
    overlap   the amount of overlap between consecutive spectra.

    """

    file = SoundFile(filename)
    sound = file[:].sum(axis=1)
    spec = self.spectrogram(sound, nfft, overlap)

    self.send_message('spectrogram',
                      {'extent': spec.shape,
                       'fs': file.sample_rate,
                       'length': len(file) / file.sample_rate},
                      spec.tostring())

  def on_data_spectrogram(self, data, nfft=1024, overlap=0.5):
    """Loads an audio file and calculates a spectrogram.

    Arguments:
    data      the content of a file from which to load audio data.
    nfft      the FFT length used for calculating the spectrogram.
    overlap   the amount of overlap between consecutive spectra.

    """

    file = SoundFile(io.BytesIO(data), virtual_io=True)
    sound = file[:].sum(axis=1)
    spec = self.spectrogram(sound, nfft, overlap)

    self.send_message('spectrogram',
                      {'extent': spec.shape,
                       'fs': file.sample_rate,
                       'length': len(file) / file.sample_rate},
                      spec.tostring())

  def spectrogram(self, data, nfft, overlap):
    """Calculate a real spectrogram from audio data

    An audio data will be cut up into overlapping blocks of length
    `nfft`. The amount of overlap will be `overlap*nfft`. Then,
    calculate a real fourier transform of length `nfft` of every
    block and save the absolute spectrum.

    Arguments:
    data      audio data as a numpy array.
    nfft      the FFT length used for calculating the spectrogram.
    overlap   the amount of overlap between consecutive spectra.

    """

    shift = round(nfft * overlap)
    num_blocks = (len(data) - nfft) // shift + 1
    specs = np.zeros((nfft / 2 + 1, num_blocks), dtype=np.float32)
    window = hann(nfft)
    for idx in range(num_blocks):
      specs[:, idx] = np.abs(
          np.fft.rfft(
              data[idx * shift:idx * shift + nfft] * window, n=nfft)) / nfft
      if idx % 10 == 0:
        self.send_message("loading_progress", {"progress": idx / num_blocks})
    specs[
        :, -1] = np.abs(np.fft.rfft(data[num_blocks * shift:], n=nfft)) / nfft
    self.send_message("loading_progress", {"progress": 1})
    return specs.T


if __name__ == "__main__":
  import os
  import webbrowser
  from tornado.web import Application
  from tornado.ioloop import IOLoop
  import random

  app = Application([("/spectrogram", SpectrogramWebSocket)])

  random.seed()
  port = random.randrange(49152, 65535)
  app.listen(port)
  webbrowser.open('file://{}/main.html?port={}'.format(os.getcwd(), port))
  IOLoop.instance().start()

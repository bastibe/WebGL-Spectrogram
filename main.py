# PyQt5 imports
from PyQt5 import QtCore, QtOpenGL, QtWidgets
from PyQt5.QtOpenGL import QGLWidget
# PyOpenGL imports
import OpenGL.GL as gl
import OpenGL.arrays.vbo as glvbo

class GLPlotWidget(QGLWidget):
    # default window size
    width, height = 600, 600

    def set_data(self, data):
        """Load 2D data as a Nx2 Numpy array.
        """
        self.data = data
        self.count = data.shape[0]

    def initializeGL(self):
        """Initialize OpenGL, VBOs, upload data on the GPU, etc.
        """
        # background color
        gl.glClearColor(0,0,0,0)
        # create a Vertex Buffer Object with the specified data
        self.vbo = glvbo.VBO(self.data)

    def paintGL(self):
        """Paint the scene.
        """
        # clear the buffer
        gl.glClear(gl.GL_COLOR_BUFFER_BIT)
        # set yellow color for subsequent drawing rendering calls
        gl.glColor(1,1,0)
        # bind the VBO
        self.vbo.bind()
        # tell OpenGL that the VBO contains an array of vertices
        gl.glEnableClientState(gl.GL_VERTEX_ARRAY)
        # these vertices contain 2 single precision coordinates
        gl.glVertexPointer(2, gl.GL_FLOAT, 0, self.vbo)
        # draw "count" points from the VBO
        gl.glDrawArrays(gl.GL_POINTS, 0, self.count)

    def resizeGL(self, width, height):
        """Called upon window resizing: reinitialize the viewport.
        """
        # update the window size
        self.width, self.height = width, height
        # paint within the whole window
        gl.glViewport(0, 0, width, height)
        # set orthographic projection (2D only)
        gl.glMatrixMode(gl.GL_PROJECTION)
        gl.glLoadIdentity()
        # the window corner OpenGL coordinates are (-+1, -+1)
        gl.glOrtho(-1, 1, -1, 1, -1, 1)

if __name__ == '__main__':
    # import numpy for generating random data points
    import sys
    import numpy as np
    import numpy.random as rdn

    # define a QT window with an OpenGL widget inside it
    class TestWindow(QtWidgets.QMainWindow):
        def __init__(self):
            super(TestWindow, self).__init__()
            # generate random data points
            self.data = np.array(.2*rdn.randn(100000,2),dtype=np.float32)
            # initialize the GL widget
            self.widget = GLPlotWidget()
            self.widget.set_data(self.data)
            # put the window at the screen position (100, 100)
            self.setGeometry(100, 100, self.widget.width, self.widget.height)
            self.setCentralWidget(self.widget)
            self.show()

    # create the QT App and window
    app = QtWidgets.QApplication(sys.argv)
    window = TestWindow()
    window.show()
    app.exec()
